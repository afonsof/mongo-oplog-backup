const Config = require('./../lib/config');
const Backup = require('./../lib/backup');
const Promise = require('bluebird');

console.log("This requires a mongodb instance running on 27017.");
console.log("It will first SHUTDOWN any instances already running on that port, and then start new ones.");
console.log("If this is undesired, CTRL+C within 5 seconds...");

setTimeout(()=> {
    console.log("Here we go...");

    new Promise((resolve, reject)=> {
        Config.execSync('mongo', ['--port', '27017', 'admin', '--eval', '\'db.shutdownServer({force: true})\''])
            .then((output)=> {
                console.log(output);
                resolve()
            })
            .catch((error)=> {
                if (error.code == 1) {
                    return resolve()
                }
                reject(error);
            });
    })

        .delay(5000)
        .then(()=> {
            return Config.exec('rm', ['-rf', 'backup-test'])
        })
        .then((output)=> {
            console.log(output);
            return Config.exec('rm', ['-rf', 'testdb'])
        })
        .then((output)=> {
            console.log(output);
            return Config.exec('mkdir', ['testdb'])
        })
        .then((output)=> {
            console.log(output);
            return Config.exec('mongod', '--port 27017 --dbpath testdb --replSet rs0 --oplogSize 20 --noprealloc --fork --smallfiles --logpath mongodb.log'.split(' '))
        })
        .then((output)=> {
            console.log(output);
        })
        .delay(3000)
        .then(()=> {
            return Config.exec('mongo', ['--port', '27017', 'admin', '--eval', `printjson(rs.initiate({
                _id: "rs0",
                version: 1,
                members: [{ _id: 0, host : "127.0.0.1:27017" }]
        }));`]);
        })
        .delay(20000)
        .then(()=> {
            const configOpts = {
                dir: 'bkp',
                full: true
            };
            var backup = new Backup(configOpts);
            return backup.perform();
        })
        .catch(err=> {
            console.error(err)
        });


}, 3000);

/* ./bin/node-mongo-oplog-backup backup --port 27017 --dir backup-test/ --full
 mongo --port 27017 backup-test --eval 'db.test.insert({"a":2})'

 ./bin/node-mongo-oplog-backup backup --port 27017 --dir backup-test/ --oplog

 sleep 5
 mongo --port 27017 backup-test --eval 'db.test.insert({"a":3})'
 ./bin/node-mongo-oplog-backup backup --port 27017 --dir backup-test/ --oplog


 sleep 5
 mongo --port 27017 backup-test --eval 'db.test.insert({"a":4})'
 ./bin/node-mongo-oplog-backup backup --port 27017 --dir backup-test/ --oplog


 mongo --port 27017 admin --eval 'db.shutdownServer({force: true})'
 sleep 5
 rm -rf testdb/*
 mongod --port 27017 --dbpath testdb --replSet rs0 --oplogSize 20 --noprealloc --fork --smallfiles --logpath mongodb.log
 sleep 3
 mongo --port 27017 admin --eval 'printjson(rs.initiate({
 _id: "rs0",
 version: 1,
 members: [{ _id: 0, host : "127.0.0.1:27017" }]
 }));'
 sleep 20

 export BACKUPDIR=`ls -1t backup-test/ |grep backup- |head -n 1`

 ./bin/node-mongo-oplog-backup restore --full --dir backup-test/$BACKUPDIR --port 27017
 mongo --port 27017 backup-test --eval 'db.test.find()'


 #mongorestore --gzip --port 27017 backup-test/$BACKUPDIR/dump
 #mongo --port 27017 backup-test --eval 'db.test.find()'
 #bundle exec bin/mongo-oplog-backup restore --oplog --dir backup-test/$BACKUPDIR --port 27017
 #mongo --port 27017 backup-test --eval 'db.test.find()'
 }, 5000);

 */