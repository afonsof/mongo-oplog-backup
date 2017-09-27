const timestamp = require('./timestamp');
let fs = require('fs');
let path = require('path');
let Config = require('./config');

module.exports = {
    each_document: function(filename) {
        return new Promise((resolve)=> {
            if (this.gzipFingerprint(filename)) {
                // todo: Zlib::GzipReader.open(filename, yield_bson_document)
            } else {
                Config.bsondump(['--quiet', `${filename}`])
                    .then((items)=> {
                        let len = items.length;
                        items = items.slice(0, len - 1);
                        let json = '[' + items.split('\n').join(',') + ']';
                        resolve(JSON.parse(json));
                    });
            }
        });
    },

    oplogTimestamps: function(filename) {
        return this.each_document(filename)
            .then(function(items) {
                return items.filter((i)=>i['ts']);
            });
    },

    FILENAME_RE: /oplog-(\d+):(\d+)-(\d+):(\d+)\.bson(?:\.gz)?/,

    timestampsFromFilename: function(filename) {
        let match = this.FILENAME_RE.exec(filename);
        if (!match) return null;
        let s1 = match[1];
        let i1 = match[2];
        let s2 = match[3];
        let i2 = match[4];

        let first = timestamp.new(s1, i1);
        let last = timestamp.new(s2, i2);
        return {
            first: first,
            last: last
        };
    },

    findOplogs: function(dir) {
        let files = fs.readdirSync(dir);
        files = files.filter((file) => {
            return this.FILENAME_RE.exec(file);
        });

        files.sort((a, b)=> {
            return this.timestampsFromFilename(a)['first'] > this.timestampsFromFilename(b)['first'];
        });
        return files;
    },

    mergeBackup: function(dir) {
        let oplogs = this.findOplogs(dir);
        let isGzip = oplogs.filter((o)=>o.endsWith('.gz'));
        let target = path.join(dir, 'dump', 'oplog.bson');
        // Mongorestore expects this filename, without a gzip suffix.
        fs.mkdirSync(path.join(dir, 'dump'));
        this.merge(target, oplogs, {gzip: isGzip});
    },

    gzipFingerprint: function(filename) {
        let bytes = fs.readFileSync(filename);
        return bytes[0] == '\x1f' && bytes[1] == '\x8b';
    }
};
