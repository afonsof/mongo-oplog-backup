const fs = require('fs');
const path = require("path");
var timestamp = require("./timestamp.js");
const Oplog = require('./oplog');
var utils = require("./utils.js");
var rimraf = require('rimraf');

module.exports = class Backup {
    constructor(config, backupName = null) {
        this.config = config;
        this.backupName = backupName;
        if (!backupName) {
            const stateFile = config.globalStateFile();
            const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {};
            this.backupName = state.backup;
        }
    }

    getBackupFolder() {
        if (!this.backupName) return null;
        return path.join(this.config.getBackupDir(), this.backupName)
    }

    getStateFile() {
        return path.join(this.getBackupFolder(), 'state.json');
    }

    writeStateFile(state) {
        fs.writeFileSync(this.getStateFile(), JSON.stringify(state));
    }

    backupOplog(options = {}) {
        let stateFile = this.getStateFile();
        if (!fs.existsSync(stateFile)) {
            throw Error(`No state in ${this.backupName}`);
        }

        let backupState = JSON.parse(fs.readFileSync(stateFile));
        let startAt = options.start || backupState.position;

        if (!startAt) {
            throw Error(':start is required');
        }

        var q = `"{ts: {$gte: Timestamp(${startAt.seconds}, ${startAt.increment})}}"`;
        let query = ['--query', q];
        let dumpArgs = ['--out', this.config.getOplogDumpFolder(), '--db', 'local', '--collection', 'oplog.rs'];
        dumpArgs = dumpArgs.concat(query);
        if (this.config.useCompression()) {
            dumpArgs.push('--gzip');
        }

        return this.config.mongodump(dumpArgs).then(output=> {
            if (!fs.existsSync(this.config.getOplogDumpFilePath())) {
                throw Error("mongodump failed");
            }

            console.log("Checking timestamps...");
            return Oplog.oplogTimestamps(this.config.getOplogDumpFilePath())
                .then(timestamps=> {
                    return new Promise((resolve)=> {
                        if (!utils.timestampsIncreasing(timestamps)) {
                            throw Error("Something went wrong - oplog is not ordered.");
                        }

                        let first = timestamps[0];
                        let last = timestamps[timestamps.length - 1];

                        if (first.high_ > startAt.seconds) {
                            throw Error(
                                `Expected first oplog entry to be ${startAt.inspect} but was ${first.inspect}\n` +
                                "The oplog is probably too small.\n" +
                                "Increase the oplog size, the start with another full backup.");
                        }
                        else if (first.high_ < startAt.seconds) {
                            throw Error("Expected first oplog entry to be #{start_at.inspect} but was #{first.inspect}\n" +
                                "Something went wrong in our query.");
                        }

                        const result = {
                            entries: timestamps.length,
                            first: first,
                            position: last
                        };

                        if (timestamps.length == 1) {
                            result.empty = true;
                        }
                        else {
                            let outfile = `oplog-${first.ts.$timestamp.t}-${last.ts.$timestamp.t}.bson`;
                            if (this.config.useCompression()) {
                                outfile += '.gz';
                            }
                            let fullPath = path.join(this.getBackupFolder(), outfile);
                            if (!fs.existsSync(this.getBackupFolder())) {
                                fs.mkdirSync(this.getBackupFolder());
                            }
                            fs.renameSync(this.config.getOplogDumpFilePath(), fullPath);

                            this.writeStateFile({
                                position: timestamp.new(result.position.ts.$timestamp.t, result.position.ts.$timestamp.i)
                            });
                            result.file = fullPath;
                            result.empty = false;
                        }

                        rimraf(this.config.getOplogDumpFolder(), function () {
                            resolve(result);
                        });
                    });
                });
        });
    }

    latestOplogTimestamp() {
        let script = path.join(__dirname, '../scripts/oplog-last-timestamp.js');
        return this.config.mongo('admin', script).then(resultText=> {
            let response = JSON.parse(resultText);

            if (!response.position) {
                return null;
            }
            return timestamp.fromJson(response.position);
        });
    }

    backupFull() {
        var that = this;
        return this.latestOplogTimestamp().then(position=> {
            return new Promise(function (resolve, reject) {
                if (!position) {
                    reject("Cannot backup with empty oplog");
                }
                that.backupName = `backup-${timestamp.toS(position)}`;

                const backupFolder = that.getBackupFolder();
                if (fs.existsSync(backupFolder)) {
                    reject("Backup folder '#{getBackupFolder}' already exists; not performing backup.");
                    return;
                }
                let dumpFolder = path.join(backupFolder, 'dump');
                if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder);
                if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

                let dumpArgs = ['--out', dumpFolder];
                if (that.config.useCompression()) {
                    dumpArgs.push('--gzip');
                }
                return that.config.mongodump(dumpArgs)
                    .then(output=> {
                        if (!fs.existsSync(dumpFolder)) {
                            console.error('Backup folder does not exist');
                            reject('Full backup failed');
                            return;
                        }
                        fs.writeFileSync(path.join(dumpFolder, 'debug.log'), output);

                        that.writeStateFile({
                            position: position
                        });

                        return resolve({
                            position: position,
                            backup: that.backupName
                        });
                    })
                    .catch(err=>reject(err));
            });
        });
    }

    perform(mode = 'auto', options = {}) {
        const dir = this.config.getBackupDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        const haveBackup = this.getBackupFolder() != null;

        if (mode == 'auto') {
            mode = haveBackup ? 'oplog' : 'full';
        }

        if (mode == 'oplog') {
            if (!haveBackup) {
                throw Error("Unknown backup position - cannot perform oplog backup. Have you completed a full backup?");
            }
            console.info("Performing incremental oplog backup");
            return this.backupOplog()
                .then(result=> {
                    if (!result.empty) {
                        const newEntries = result.entries - 1;
                        console.info(`Backed up ${newEntries} new entries to ${result.file}`);
                    }
                    else {
                        console.info('Nothing new to backup');
                    }
                });
        }
        else if (mode == 'full') {
            console.log("Performing full backup");
            return this.backupFull()
                .then(result=> {
                    fs.writeFileSync(this.config.globalStateFile(), JSON.stringify({
                        backup: result.backup
                    }));
                    console.info("Performed full backup");
                })
                .then(()=>this.perform('oplog', options));
        }
    }
};