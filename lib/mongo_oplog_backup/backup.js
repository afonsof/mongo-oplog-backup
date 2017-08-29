const fs = require('fs');
const path = require("path");
var timestamp = require("./ext/timestamp.js");
const Oplog = require('./oplog');
var utils = require("./utils.js");
var rimraf = require('rimraf');

module.exports = class Backup {
    constructor(config, backup_name = null) {
        this.config = config;
        this.backup_name = backup_name;
        if (!backup_name) {
            let state_file = config.global_state_file();
            let state = fs.existsSync(state_file) ? JSON.parse(fs.readFileSync(state_file)) : {};
            this.backup_name = state.backup;
        }
    }

    getBackupFolder() {
        if (!this.backup_name) return null;
        return path.join(this.config.getBackupDir(), this.backup_name)
    }

    getStateFile() {
        return path.join(this.getBackupFolder(), 'state.json');
    }

    writeStateFile(state) {
        fs.writeFileSync(this.getStateFile(), JSON.stringify(state));
    }

    backup_oplog(options = {}) {
        let stateFile = this.getStateFile();
        if (!fs.existsSync(stateFile)) {
            throw Error(`No state in ${this.backup_name}`);
        }

        let backup_state = JSON.parse(fs.readFileSync(stateFile));
        let start_at = options['start'] || backup_state['position'];

        if (!start_at) {
            throw Error(':start is required');
        }

        var q = `"{ts: {$gte: Timestamp(${start_at.seconds}, ${start_at.increment})}}"`;
        let query = ['--query', q];
        let dump_args = ['--out', this.config.getOplogDumpFolder(), '--db', 'local', '--collection', 'oplog.rs'];
        dump_args = dump_args.concat(query);
        if (this.config.use_compression()) {
            dump_args.push('--gzip');
        }

        return this.config.mongodump(dump_args).then(output=> {
            if (!fs.existsSync(this.config.getOplogDumpFilePath())) {
                throw Error("mongodump failed");
            }

            console.log("Checking timestamps...");
            return Oplog.oplog_timestamps(this.config.getOplogDumpFilePath())
                .then(timestamps=> {
                    return new Promise((resolve)=> {
                        if (!utils.timestampsIncreasing(timestamps)) {
                            throw Error("Something went wrong - oplog is not ordered.");
                        }

                        let first = timestamps[0];
                        let last = timestamps[timestamps.length - 1];

                        if (first.high_ > start_at.seconds) {
                            throw Error(
                                `Expected first oplog entry to be ${start_at.inspect} but was ${first.inspect}\n` +
                                "The oplog is probably too small.\n" +
                                "Increase the oplog size, the start with another full backup.");
                        }
                        else if (first.high_ < start_at.seconds) {
                            throw Error("Expected first oplog entry to be #{start_at.inspect} but was #{first.inspect}\n" +
                                "Something went wrong in our query.");
                        }

                        const result = {
                            entries: timestamps.length,
                            first: first,
                            position: last
                        };

                        if (timestamps.length == 1) {
                            result['empty'] = true;
                        }
                        else {
                            let outfile = `oplog-${first.ts.$timestamp.t}-${last.ts.$timestamp.t}.bson`;
                            if (this.config.use_compression()) {
                                outfile += '.gz';
                            }
                            let full_path = path.join(this.getBackupFolder(), outfile);
                            if (!fs.existsSync(this.getBackupFolder())) {
                                fs.mkdirSync(this.getBackupFolder());
                            }
                            fs.renameSync(this.config.getOplogDumpFilePath(), full_path);

                            this.writeStateFile({
                                position: timestamp.new(result.position.ts.$timestamp.t, result.position.ts.$timestamp.i)
                            });
                            result.file = full_path;
                            result.empty = false;
                        }

                        rimraf(this.config.getOplogDumpFolder(), function () {
                            resolve(result);
                        });
                    });
                });
        });
    }

    // Because https://jira.mongodb.org/browse/SERVER-18643
    // Mongo shell warns (in stdout) about self-signed certs, regardless of 'allowInvalidCertificates' option.
    //def strip_warnings_which_should_be_in_stderr_anyway data
    //  data.gsub(/^.*[thread\d.*].* certificate.*$/,'')
    //end

    latest_oplog_timestamp() {
        let script = path.join(__dirname, '../../scripts/oplog-last-timestamp.js');
        return this.config.mongo('admin', script).then(result_text=> {
            let response = JSON.parse(result_text);

            if (!response.position) {
                return null;
            }
            return timestamp.from_json(response.position);
        });
    }

    backupFull() {
        return this.latest_oplog_timestamp().then(position=> {
            if (!position) {
                throw Error("Cannot backup with empty oplog");
            }
            this.backup_name = `backup-${timestamp.to_s(position)}`;
            if (fs.existsSync(this.getBackupFolder())) {
                Promise.reject("Backup folder '#{getBackupFolder}' already exists; not performing backup.");
                return;
            }
            let dump_folder = path.join(this.getBackupFolder(), 'dump');
            let dump_args = ['--out', dump_folder];
            if (this.config.use_compression()) {
                dump_args.push('--gzip');
            }
            return this.config.mongodump(dump_args)
                .then(output=> {
                    if (!fs.existsSync(dump_folder)) {
                        console.error('Backup folder does not exist');
                        Promise.reject('Full backup failed');
                        return;
                    }
                    fs.writeFileSync(path.join(dump_folder, 'debug.log'), output);

                    this.writeStateFile({
                        position: position
                    });

                    return Promise.resolve({
                        position: position,
                        backup: this.backup_name
                    });
                })
                .catch(err=> {
                    if (result.standard_error.length > 0) {
                        fs.writeFileSync(path.join(dump_folder, 'error.log'), err);
                    }
                });
        });
    }

    perform(mode = 'auto', options = {}) {
        const dir = this.config.getBackupDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        const have_backup = this.getBackupFolder() != null;

        if (mode == 'auto') {
            mode = have_backup ? 'oplog' : 'full';
        }

        if (mode == 'oplog') {
            if (!have_backup) {
                throw Error("Unknown backup position - cannot perform oplog backup. Have you completed a full backup?");
            }
            console.info("Performing incremental oplog backup");
            return this.backup_oplog()
                .then(result=> {
                    if (!result['empty']) {
                        const new_entries = result['entries'] - 1;
                        console.info(`Backed up ${new_entries} new entries to ${result['file']}`);
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
                    fs.writeFileSync(this.config.global_state_file(), JSON.stringify({
                        backup: result['backup']
                    }));
                    console.info("Performed full backup");
                })
                .then(()=>this.perform('oplog', options));
        }
    }
};