const path = require("path");
const yaml = require("node-yaml");
var fs = require("fs");
var child_process = require("child_process");

module.exports = class Config {
    constructor(options) {
        const config_file = options['file'];
        delete options.file;
        // Command line options take precedence
        this.options = Object.assign({}, Config.from_file(config_file), options);
    }

    static from_file(file) {
        let options = {};
        if (file && fs.existsSync(file)) {
            const conf = yaml.readSync(file);
            options['gzip'] = conf["gzip"] || false;
            options['ssl'] = conf["ssl"] || false;
            options['sslAllowInvalidCertificates'] = conf["sslAllowInvalidCertificates"] || false;
            options['sslCAFile'] = conf["sslCAFile"];
            options['sslPEMKeyFile'] = conf["sslPEMKeyFile"];
            options['sslPEMKeyPassword'] = conf["sslPEMKeyPassword"];
            options['authenticationDatabase'] = conf["authenticationDatabase"];
            options['host'] = conf["host"];
            options['port'] = conf["port"];
            options['username'] = conf["username"];
            options['password'] = conf["password"];
        }
        return options;
    }

    getBackupDir() {
        return this.options['dir']
    }

    use_compression() {
        return !!this.options['gzip'];
    }

    command_line_options() {
        const args = [];
        if (this.options.ssl) {
            args.push('--ssl');
        }
        if (this.options.sslAllowInvalidCertificates) {
            args.push('--sslAllowInvalidCertificates');
        }
        ['host', 'port', 'username', 'password', 'sslCAFile', 'sslPEMKeyFile', 'sslPEMKeyPassword'].forEach(option => {
            if (this.options[option]) {
                args.push(`--${option}`, this.options[option].trim())
            }
        });

        if (this.options.authenticationDatabase) {
            args.push('--authenticationDatabase', options.authenticationDatabase);
        }
        else {

            if (this.options.username && !this.options.sslPEMKeyFile) {
                args.push('--authenticationDatabase', 'admin');
            }
            if (this.options.sslPEMKeyFile) {
                args.push('--authenticationDatabase', '$external');
            }
        }

        if (this.options.sslPEMKeyFile) {
            args.push('--authenticationMechanism', 'MONGODB-X509');
        }

        return args;
    }

    getOplogDumpFolder() {
        return path.join(this.getBackupDir(), 'tmp-dump');
    }

    getOplogDumpFilePath() {
        if (this.use_compression()) {
            return path.join(this.getOplogDumpFolder(), 'local/oplog.rs.bson.gz')
        }
        else {
            return path.join(this.getOplogDumpFolder(), 'local/oplog.rs.bson')
        }
    }

    global_state_file() {
        return path.join(this.getBackupDir(), 'backup.json');
    }

    mongodump(args) {
        return Config.exec('mongodump', this.command_line_options().concat(args));
    }

    mongo(db, script) {
        return Config.exec('mongo', this.command_line_options().concat(['--quiet', '--norc', db, script]));
    }

    mongorestore(args) {
        return Config.exec('mongorestore', this.command_line_options().concat(args));
    }

    static bsondump(args) {
        return Config.exec('bsondump', args);
    }

    static exec(cmd, args) {
        console.log(cmd, args);
        return new Promise((resolve, reject)=> {
            var child = child_process.spawn(cmd, args);
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', function (data) {
                stdout += data;
            });

            child.stderr.on('data', function (data) {
                stdout += data
            });

            child.on('close', function (code) {
                if (code === 0) {
                    resolve(stdout);
                }
                else {
                    reject(stderr);
                }
            });
        });
    }

    command_string(cmd) {
        let previous = null;
        let filtered = cmd.map(token => {
            let pwd = (previous == '--password');
            previous = token;
            if (pwd) {
                return '***'
            }
            else {
                return token;
            }
        });
        filtered.join(' ');
    }
};