const path = require('path');
const yaml = require('node-yaml');
let fs = require('fs');
let childProcess = require('child_process');
const Promise = require('bluebird');

module.exports = class Config {
    constructor(options) {
        const configFile = options['file'];
        delete options.file;
        // Command line options take precedence
        this.options = Object.assign({}, Config.fromFile(configFile), options);
    }

    static fromFile(file) {
        let options = {};
        if (file && fs.existsSync(file)) {
            const conf = yaml.readSync(file);
            options['gzip'] = conf['gzip'] || false;
            options['ssl'] = conf['ssl'] || false;
            options['sslAllowInvalidCertificates'] = conf['sslAllowInvalidCertificates'] || false;
            options['sslCAFile'] = conf['sslCAFile'];
            options['sslPEMKeyFile'] = conf['sslPEMKeyFile'];
            options['sslPEMKeyPassword'] = conf['sslPEMKeyPassword'];
            options['authenticationDatabase'] = conf['authenticationDatabase'];
            options['host'] = conf['host'];
            options['port'] = conf['port'];
            options['username'] = conf['username'];
            options['password'] = conf['password'];
        }
        return options;
    }

    getBackupDir() {
        return this.options['dir'];
    }

    useCompression() {
        return !!this.options['gzip'];
    }

    commandLineOptions() {
        const args = [];
        if (this.options.ssl) {
            args.push('--ssl');
        }
        if (this.options.sslAllowInvalidCertificates) {
            args.push('--sslAllowInvalidCertificates');
        }

        const argsToVerify = [
            'host', 'port', 'username',
            'password', 'sslCAFile', 'sslPEMKeyFile',
            'sslPEMKeyPassword'
        ];

        argsToVerify.forEach((option) => {
            if (this.options[option]) {
                args.push(`--${option}`, this.options[option].trim());
            }
        });

        if (this.options.authenticationDatabase) {
            args.push('--authenticationDatabase', options.authenticationDatabase);
        } else {
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
        if (this.useCompression()) {
            return path.join(this.getOplogDumpFolder(), 'local/oplog.rs.bson.gz');
        } else {
            return path.join(this.getOplogDumpFolder(), 'local/oplog.rs.bson');
        }
    }

    globalStateFile() {
        return path.join(this.getBackupDir(), 'backup.json');
    }

    mongodump(args) {
        return Config.exec('mongodump', this.commandLineOptions().concat(args));
    }

    mongo(db, script) {
        return Config.exec('mongo', this.commandLineOptions().concat(['--quiet', '--norc', db, script]));
    }

    mongorestore(args) {
        return Config.exec('mongorestore', this.commandLineOptions().concat(args));
    }

    static bsondump(args) {
        return Config.exec('bsondump', args);
    }

    static execSync(cmd, args){
        return new Promise((resolve,reject)=> {
            console.log(cmd, args.join(' '));
            const res = childProcess.spawnSync(cmd, args);
            if(res.stderr.length){
                return reject({code:res.status, error: res.stderr.toString()})
            }
            resolve(res.output.toString());
        });
    }

    static exec(cmd, args) {
        console.log(cmd, args.join(' '));
        return new Promise((resolve, reject)=> {
            let child = childProcess.spawn(cmd, args);
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString()
            });
            child.stderr.on('data', (data) => {
                stderr += data.toString()
            });
            child.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject({code: code, error: stderr || stdout});
                }
            });
        });
    }

    commandString(cmd) {
        let previous = null;
        let filtered = cmd.map((token) => {
            let pwd = (previous == '--password');
            previous = token;
            if (pwd) {
                return '***';
            } else {
                return token;
            }
        });
        filtered.join(' ');
    }
};
