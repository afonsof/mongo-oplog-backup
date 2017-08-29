#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const argparse = require("argparse");

//classes
const ArgumentParser = argparse.ArgumentParser;
const Config = require('../lib/mongo_oplog_backup/config');
const Backup = require('../lib/mongo_oplog_backup/backup');
const Restore = require("../lib/mongo_oplog_backup/restore");
const Oplog = require("../lib/mongo_oplog_backup/oplog");

//Create main parser
const parser = new ArgumentParser({
    version: "0.0.1",
    addHelp: true,
    description: "Usage: mongo-incremental-backup [options]"
});

//Create subParsers
const subParsers = parser.addSubparsers({
    title: 'subCommands',
    dest: "subCommandName"
});

const backupParser = subParsers.addParser('backup', {
    addHelp: true
});

const mergeParser = subParsers.addParser('merge', {
    addHelp: true
});

var restoreParser = subParsers.addParser('restore', {
    addHelp: true
});

//Create arguments
backupParser.addArgument(["-v", "--verbose"], {
    help: "Enable verbose mode",
    action: 'storeTrue'
});

backupParser.addArgument(["-d", "--dir"], {
    help: "Directory to store backup files. Defaults to 'backup'.",
    required: true
});

backupParser.addArgument(["--full"], {
    help: "Force full backup",
    action: 'storeTrue'
});

backupParser.addArgument(["-f", "--file"], {
    help: "Configuration file for common defaults",
    required: true
});

backupParser.addArgument(["--oplog"], {
    help: "Force oplog backup",
    action: 'storeTrue'
});

backupParser.addArgument(["--gzip"], {
    help: "Use gzip compression",
    action: 'storeTrue'
});

backupParser.addArgument(["--ssl"], {
    help: "Connect to a mongod instance over an SSL connection",
    action: 'storeTrue'
});

backupParser.addArgument(["--sslAllowInvalidCertificates"], {
    help: "Allow connections to a mongod instance with an invalid certificate",
    action: 'storeTrue'
});

backupParser.addArgument(["--sslCAFile"], {
    help: "Specifies a Certificate Authority file for validating the SSL certificate provided by the mongod instance."
});

backupParser.addArgument(["--sslPEMKeyFile"], {
    help: "Specifies a SSL client certificate and private key for authenticating with the mongod instance"
});

backupParser.addArgument(["--sslPEMKeyPassword"], {
    help: "Specifies the password used to open the sslPEMKeyFile, if required."
});

backupParser.addArgument(["--authenticationDatabase"], {
    help: "Specifies the database to authenticate against.  This can be used to override the default selection."
});

backupParser.addArgument(["--host"], {
    help: "Specifies a resolvable hostname for the mongod that you wish to backup.",
    defaultValue: "localhost"
});

backupParser.addArgument(["--port"], {
    help: "Specifies the port that mongod is running on",
    defaultValue: "27017"
});

backupParser.addArgument(["-u", "--username"], {
    help: "Specifies a username to authenticate to the MongoDB instance, if your database requires authentication. Use in conjunction with the --password option to supply a password."
});

backupParser.addArgument(["-p", "--password"], {
    help: "Specifies a password to authenticate to the MongoDB instance. Use in conjunction with the --username option to supply a username. Note. the password will not be prompted for, so must be passed as an argument"
});

mergeParser.addArgument(["-v", "--verbose"], {
    help: "Enable verbose mode",
    action: 'storeTrue'
});

mergeParser.addArgument(["-d", "--dir"], {
    help: "Directory containing the backup to restore. Must contain a 'dump' folder.",
    required: true
});

restoreParser.addArgument(["-v", "--verbose"], {
    help: "Enable verbose mode",
    action: 'storeTrue'
});

restoreParser.addArgument(["-d", "--dir"], {
    help: "Directory to store backup files. Defaults to 'backup'.",
    required: true
});

restoreParser.addArgument(["--full"], {
    help: "Force full backup",
    action: 'storeTrue'
});

restoreParser.addArgument(["-f", "--file"], {
    help: "Configuration file for common defaults",
    required: true
});

restoreParser.addArgument(["--oplog"], {
    help: "Force oplog backup",
    action: 'storeTrue'
});

restoreParser.addArgument(["--gzip"], {
    help: "Use gzip compression",
    action: 'storeTrue'
});

restoreParser.addArgument(["--ssl"], {
    help: "Connect to a mongod instance over an SSL connection",
    action: 'storeTrue'
});

restoreParser.addArgument(["--sslAllowInvalidCertificates"], {
    help: "Allow connections to a mongod instance with an invalid certificate",
    action: 'storeTrue'
});

restoreParser.addArgument(["--sslCAFile"], {
    help: "Specifies a Certificate Authority file for validating the SSL certificate provided by the mongod instance."
});

restoreParser.addArgument(["--sslPEMKeyFile"], {
    help: "Specifies a SSL client certificate and private key for authenticating with the mongod instance",
    required: true
});

restoreParser.addArgument(["--sslPEMKeyPassword"], {
    help: "Specifies the password used to open the sslPEMKeyFile, if required.",
    required: true
});

restoreParser.addArgument(["--authenticationDatabase"], {
    help: "Specifies the database to authenticate against.  This can be used to override the default selection.",
    required: true
});

restoreParser.addArgument(["--host"], {
    help: "Specifies a resolvable hostname for the mongod that you wish to backup.",
    default: "localhost",
    required: true
});

restoreParser.addArgument(["--port"], {
    help: "Specifies the port that mongod is running on",
    default: "27017",
    required: true
});

restoreParser.addArgument(["-u", "--username"], {
    help: "Specifies a username to authenticate to the MongoDB instance, if your database requires authentication. Use in conjunction with the --password option to supply a password.",
    required: true
});

restoreParser.addArgument(["-p", "--password"], {
    help: "Specifies a password to authenticate to the MongoDB instance. Use in conjunction with the --username option to supply a username. Note. the password will not be prompted for, so must be passed as an argument",
    required: true
});

restoreParser.addArgument(['--noIndexRestore'], {
    help: "Don't restore indexes.",
    action: 'storeTrue'
});

restoreParser.addArgument('--oplogLimit', {
    help: "Only include oplog entries before the provided Timestamp: <seconds>[:ordinal]",
    required: true
});

restoreParser.addArgument(['--oplogStartAt'], {
    help: "Ignore oplog batches before the provided Timestamp: <seconds>[:ordinal]. This is useful for resuming a restore after an error.",
    required: true
});

var opts = parser.parseArgs();
var action = opts['subCommandName'];

console.log(JSON.stringify(opts));

function executeAction(opts, action) {
    if (action == "backup") {
        const dir = opts.dir || "backup";
        let mode = "auto";
        if (opts.full !== false) {
            mode = "full";
        } else if (opts.oplog !== false) {
            mode = "oplog";
        }

        const configOpts = {
            dir: dir,
            gzip: opts.gzip || false,
            ssl: opts.ssl || false,
            sslAllowInvalidCertificates: opts.sslAllowInvalidCertificates || false,
            file: opts.file,
            host: opts.host,
            port: opts.port,
            username: opts.username,
            password: opts.password,
            sslCAFile: opts.sslCAFile,
            sslPEMKeyFile: opts.sslPEMKeyFile,
            sslPEMKeyPassword: opts.sslPEMKeyPassword,
            authenticationDatabase: opts.authenticationDatabase
        };
        const config = new Config(configOpts);
        const backup = new Backup(config);
        return backup.perform(mode);
    }
    else if (action == "merge") {
        const dir = opts.dir;
        if (!dir) {
            throw Error("dir must be specified");
        }
        if (!fs.existsSync(path.join(dir, "dump"))) {
            throw Error("dir must contain a dump subfolder");
        }
        return Oplog.mergeBackup(dir);
        //puts
        //puts "Restore the backup with: "
        //puts "mongorestore [--drop] [--gzip] --oplogReplay #{File.join(dir, 'dump')}"
    }
    else if (action == 'restore') {
        const dir = opts.dir;

        if (!dir) {
            throw Error("dir must be specified");
        }

        if (!fs.existsSync(path.join(dir, "dump"))) {
            throw Error("dir must contain a dump subFolder");
        }

        let mode;
        if (opts.full) {
            mode = "full";
        }
        else if (opts.oplog) {
            mode = "oplog";
        }
        else {
            throw Error("either full or oplog must be specified");
        }

        var configOpts = {
            dir: dir,
            ssl: opts.ssl || false,
            gzip: opts.gzip || false,
            sslAllowInvalidCertificates: opts.sslAllowInvalidCertificates || false,
            noIndexRestore: opts.noIndexRestore || false,
            host: opts.host,
            port: opts.port,
            username: opts.username,
            password: opts.password,
            sslCAFile: opts.sslCAFile,
            oplogLimit: opts.oplogLimit,
            oplogStartAt: opts.oplogStartAt
        };

        var restoreOpts = {
            oplogLimit: opts.oplogLimit
        };

        const config = new Config(configOpts);
        const restore = new Restore(config);
        return restore.perform(mode, restoreOpts);
    }
}

executeAction(opts, action)
    .then(function () {
        process.exit(0);
    })
    .catch(err=> {
        console.error(err);
        process.exit(1);
    });
