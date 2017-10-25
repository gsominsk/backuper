var express = require('express');
var needle  = require ('needle');
var router  = express.Router();
var http    = require('http');
var fs      = require('fs');
var async   = require('async');


/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/deleteBckps', function(req, res, next) {
    deleteFilesFromServer(req, res);
});
router.post('/createBckps', function(req, res, next) {
    copyFileToServer(req, res);
});

module.exports = router;

function deleteFilesFromServer(req, res) {
    var data = {
        range: 0
    };

    needle.request('post', 'localhost:1070/deleteLocalBackups', JSON.stringify(data), {json:true}, function(err, resp) {
        console.log(resp.body);
        err ?
            console.log('neddle error', err)
            : res.send(JSON.stringify(resp.body));
    });
}

function copyFileToServer (req, res) {
    var data = {
        ftp: {
            config: {
                protocol: 'FTP',
                host: '66.220.9.50',
                port: '21',
                user: 'gsominsk',
                passwd: '19983562'
            },
            bckps: [{
                folder: __dirname+'/../backuptest',
                filename: '',
                backuppath: 'backup/',
                maxBackupFilesToServer: ''
            }, {
                folder: __dirname+'/../backuptest',
                filename: 'backup.txt',
                backuppath: 'backup/',
                maxBackupFilesToServer: ''
            }]
        },
        sftp: {
            config: {
                protocol: 'SFTP',
                host: 's.bpi.in.ua',
                port: '22',
                user: 'norn',
                passwd: 'c2h5ohbrew'
            },
            bckps: [{
                folder: __dirname+'/../backuptest',
                filename: '',
                backuppath: '/mnt/Files/',
                maxBackupFilesToServer: ''
            }, {
                folder: __dirname+'/../backuptest',
                filename: 'backup.txt',
                backuppath: '/mnt/Files/',
                maxBackupFilesToServer: ''
            }]

        }
    };

    var log = '';
    var q = async.queue(function(bckpFile, callback) {
        needle.request('post', 'localhost:1070/makeBackup', JSON.stringify(bckpFile), {json:true}, function(err, resp) {
            err ?
                console.log('neddle error', err)
                : callback(resp.body);
        });
    }, 1);

    q.push(data.ftp, (str) => {
        console.log(str);
        log += str;
    });

    q.drain = () => res.send(JSON.stringify(log));
}
