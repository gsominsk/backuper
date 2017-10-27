
var logtext         = require('../helpers/logtext');
var SMTPConnection  = require('smtp-connection');
var querystring     = require("querystring");
var formidable      = require("formidable");
var nodemailer      = require('nodemailer');
var async           = require('async');
const url           = require('url');
var fs              = require("fs");
var fsnew           = require("fs");
const https         = require('https');
const http          = require('http');
const AdmZip        = require('adm-zip');
var ftpClient       = require('ftp');
var zlib            = require('zlib');
var client          = require('scp2');
var join            = require('path').join;
var path            = require('path');
var archiver        = require('archiver');
var util            = require('util');
var moment          = require('moment');

/**
 *
 * @param response
 * @param request
 *
 * getDataForBackup - функция получает обьект с конфигом и массивом файлов/папок
 * которым надо сделать бекап. После чего из массивы достается каждый из елементов
 * отправляя его в функцию проверки существования данного файла или каталога. Если
 * файл/каталог существует, в зависимости от того файл это или каталог архивируем как
 * файл или как всю папку функцией makeArchive. После этого полученный файл, отправляем
 * бандеролью по адресу указаном в обьекта конфига. (SFTP, FTP, SSH).
 *
 * Структура обьекта в котором лежит массив файлов + конфиг имеет вид:
 *
 * {
 *      config: {
 *           protocol: 'FTP',
 *           host: '66.220.9.50',
 *           port: '21',
 *           user: 'gsominsk',
 *           passwd: '19983562'
 *       },
 *       bckps: [{
 *           folder: __dirname+'/../backuptest',
 *           filename: 'backup.txt',
 *           protocol: 'FTP',
 *           backuppath: '/'
 *       }]
 * }
 */

var ll = '';

// To compare 2 dates.
var dates = {
    convert:function(d) {
        // Converts the date in d to a date-object. The input can be:
        //   a date object: returned without modification
        //  an array      : Interpreted as [year,month,day]. NOTE: month is 0-11.
        //   a number     : Interpreted as number of milliseconds
        //                  since 1 Jan 1970 (a timestamp)
        //   a string     : Any format supported by the javascript engine, like
        //                  "YYYY/MM/DD", "MM/DD/YYYY", "Jan 31 2009" etc.
        //  an object     : Interpreted as an object with year, month and date
        //                  attributes.  **NOTE** month is 0-11.
        return (
            d.constructor === Date ? d :
                d.constructor === Array ? new Date(d[0],d[1],d[2]) :
                    d.constructor === Number ? new Date(d) :
                        d.constructor === String ? new Date(d) :
                            typeof d === "object" ? new Date(d.year,d.month,d.date) :
                                NaN
        );
    },
    compare:function(a,b) {
        // Compare two dates (could be of any type supported by the convert
        // function above) and returns:
        //  -1 : if a < b
        //   0 : if a = b
        //   1 : if a > b
        // NaN : if a or b is an illegal date
        // NOTE: The code inside isFinite does an assignment (=).
        return (
            isFinite(a=this.convert(a).valueOf()) &&
            isFinite(b=this.convert(b).valueOf()) ?
                (a>b)-(a<b) :
                NaN
        );
    },
    inRange:function(d,start,end) {
        // Checks if date in d is between dates in start and end.
        // Returns a boolean or NaN:
        //    true  : if d is between start and end (inclusive)
        //    false : if d is before start or after end
        //    NaN   : if one or more of the dates is illegal.
        // NOTE: The code inside isFinite does an assignment (=).
        return (
            isFinite(d=this.convert(d).valueOf()) &&
            isFinite(start=this.convert(start).valueOf()) &&
            isFinite(end=this.convert(end).valueOf()) ?
                start <= d && d <= end :
                NaN
        );
    }
}

var sendVia = {
    FTP: sendFilesViaFTP,
    SFTP: sendFilesViaSFTP
}

function getDataForBackup(response,request) {
    ll = '';
    console.time();

    var timecheck = time();

    response.writeHead(200, {"Content-Type": "text/html"});

    var data        = '';
    var bckpPaths   = [];
    var q;
    createLog(`[Request handler 'getDataForBackup' was called] ... \n`);

    request.addListener('data', (chunk) => data += chunk);
    request.addListener('end', () => {
        data = JSON.parse(data);

        createLog('==============================');
        createLog('             data             ');
        createLog('==============================');
        createLog(sObj(data));

        createLog('==============================');
        createLog(' checking data configuration  ');
        createLog('==============================');

        // check config
        if (configValidation(data.config) == false) return (errorResponseEnd(response, err));

        createLog(`[checking successful] ...`);

        createLog('==============================');
        createLog('  starting archivating files  ');
        createLog('==============================');

        // call function that archivating our files/folders
        q = async.queue((data, callback) => {
            createArchive(data.obj, data.config, data.unique, (bckp) => {
                bckpPaths.push(bckp);
                callback(null, 'ok');
            });
        }, 1);

        // adding new files/folders to archivate via archive
        for (var i = 0; i < data.bckps.length; i++)
            fileValidation(data.bckps[i]) == true ?
                q.push({obj:data.bckps[i], config:data.config, unique: i}, () => {})
                : errorResponseEnd(response, `[err] : File ${data.bckps[i].filename} with path ${data.bckps[i].folder} not added.`);

        // sending data back for logs
        q.drain = function() {
            createLog('==============================');
            createLog('       created backups        ');
            createLog('==============================');
            createLog(sObj(bckpPaths));

            async.series([
                function(callback) {
                    createLog('==============================');
                    createLog(`       sending via ${data.config.protocol}`);
                    createLog('==============================');

                    sendVia[data.config.protocol](bckpPaths, data.config, response, () => callback(null, 1));
                }
            ],
            function(err, results) {
                createLog();
                createLog('==============================');
                createLog('             time             ');
                createLog('==============================');
                createLog(timecheck());

                console.log(ll);
                response.write(ll);
                response.end();
            });
        };
    });
}

// archiving files and folders

function createArchive(bckp, config, unique, callback) {
    createLog('[creating archive] ...');

    var path = `${__dirname}/../backups`;
    // если папки для бекапов архивированных бекапов еще не существует, создать ее.
    if (fs.existsSync(path) == false) fs.mkdirSync(path, 0744);

    var now         = new Date();
    var dirOrFile   = bckp.filename.trim().length == 0;
    var bckpName    = `${path}/bckp_${unique}_${moment().get('year')}-${moment().get('month')+1}-${moment().get('date')}_${now.getHours()}-${now.getMinutes()}.zip`;
    var output = fs.createWriteStream(bckpName);
    var archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    output.on('close', () => {
        createLog('[total bytes] : ' + archive.pointer());
        createLog('[archiver has been finalized] ...');
        callback({name : bckpName, backupPath: bckp.backuppath});
    });

    output.on('end', () => createLog('Data has been drained'));

    archive.on('warning', (err) => {
        if (err.code === 'ENOENT') createLog(`[err] : ${err}`);
        else {
            createLog(`[err] : ${err}`);
            return callback();
        }
    });

    archive.on('error', function(err) {
        createLog(`[err] : ${err}`);
        return callback();
    });

    archive.pipe(output);

    createLog('[checking file or dir] ...');
    createLog(`[it's a ${dirOrFile ? 'dir' : 'file'}]`);
    createLog(sObj(bckp));
    if (dirOrFile) {
        archive.directory(bckp.folder, false);
    } else
        archive.file(`${bckp.folder}${bckp.filename}`, { name: bckp.filename });

    archive.finalize();
}

// sending files via

function sendFilesViaFTP (files, config, response, callback) {
    createLog(`[Get into sendFilesViaFTP] ...`);

    let c = new ftpClient();
    let cdata = {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.passwd
    };

    c.connect(cdata);
    createLog(`[connecting] ... `);
    c.on('ready', () => createLog(`[connected] ... `));
    c.on('error', (error) => errorResponseEnd(response, error));

    var q = async.queue((file, callback) => {
        var name = file.name.split('/')[file.name.split('/').length - 1];
        c.put(file.name, `${file.backupPath}/${name}.gz`, (err) => {
            if (err) {
                createLog(`[err] : ${err}`);
                return callback(null);
            }
            createLog(`[file] : ${name}.gz `);
            createLog(`[path] : ${file.backupPath}/${name}.gz \n`);
            createLog(`[file added via ftp] ... `);
            callback(name);
        });
    }, 1);

    for (var i = 0; i < files.length; i++)
        q.push(files[i], () => {});

    q.drain = () => callback(c.end());
}

function sendFilesViaSFTP (files, config, response, callback) {
    createLog(`[Get into sendFilesViaSFTP] ...`);

    var path = `${__dirname}/../backups`;
    var q = async.queue((file, callback) => {
        var name = file.name.split('/')[file.name.split('/').length - 1];

        var Client = require('ssh2').Client;
        var conn = new Client();

        conn.on('connect', () => createLog('[connected via sftp server] ...'));

        conn.on('error', (err) => createLog(`[err] : ${err}`));
        conn.on('end',  () => createLog(`[connection ended] ...`));

        conn.on('ready', function() {
            conn.sftp(function(err, sftp) {
                if (err) return callback(createLog(`[err] : ${err}`));
                createLog(`[name] : ${name}`);
                createLog(`[path] : ${`${file.backupPath}/${name}`}`);

                sftp.on('end', () => createLog(`[SFTP session ended] ...`));
                sftp.on('close', () => {
                    console.log(`[SFTP session closed] ...`);
                    callback(sftp.end());
                });

                var from = fs.createReadStream(`${path}/${name}`);
                var to = sftp.createWriteStream(`${file.backupPath}/${name}`);

                from.on('close', () => callback(sftp.end()));
                to.on('close', () => callback(sftp.end()));

                from.pipe(to);
            });
        }).connect({
            host: config.host,
            port: config.port,
            username: config.user,
            password: config.passwd
        });
    }, 1);

    for (var i = 0; i < files.length; i++)
        q.push(files[i], () => {});

    q.drain = () => callback();
}

// validation

function fileValidation (bckp) {
    var valid = false;

    fs.existsSync(bckp.folder) ? valid = true : createLog(`[err] : Folder ${bckp.folder} doesn't exists`);
    bckp.maxBackupFilesToServer.trim().length == 0 ? bckp.maxBackupFilesToServer = 0 : 0;
    bckp.backuppath[bckp.backuppath.length-1] == '/' ? bckp.backuppath = bckp.backuppath.substring(0, bckp.backuppath.length - 1) : 0;
    bckp.folder[bckp.folder.length-1] != '/' ? bckp.folder = bckp.folder + '/' : 0;

    return (valid);
}

function configValidation (config) {
    var valid = false;

    ['FTP', 'SFTP'].map((protocol) => protocol == config.protocol ? valid = true : 0);
    valid == false ? createLog(`[err] : Invalid protocol`) : 0;

    for (var val in config) {
        if (config[val].trim().length == 0 && val != 'passwd') {
            valid = false;
            createLog(`[err] : Field ${val} in config is empty`);
        }
    }

    return (valid);
}

// wrappers

function errorResponseEnd (response, err) {
    err ? createLog(err) : 0;
    response.write(ll);
    console.log(ll);
    return response.end();
}

function sObj (data) {
    return (util.inspect(data, false, null));
}

function createLog (str) {
    typeof(str) == 'object' ? str = sObj(str) : 0;
    !str ? str = '\n' : str[str.length - 1] != '\n' ? str += '\n' : 0;
    logtext.log(str);
    ll += str;
}

function time () {
    var begin = Date.now();
    return () => {
        var end = Date.now();
        return (end-begin)/1000;
    }
}

/**
 *
 * @param range
 * @param callback
 *
 * Функция удаляет все файлы в папке backups которые не попадают в диапазон от
 * указанного числа до момента запроса.
 *
 * Функции передается параметр range это начало диапазона до момента вызова
 * функции. Тоесть если там указано число 7 это будет означать - оставь все файлы
 * в диапазоне от нынешнего момента до давности в 7 дней. Все остальные файлы которые
 * не попадают в этот диапазон мы удаляем.
 */

// function cleanBckps (range, callback) {
function cleanBckps (response, request) {
    ll = '';

    // start time test
    var timecheck = time();

    response.writeHead(200, {"Content-Type": "text/html"});

    createLog(`[Request handler 'cleanBckps' was called] ... \n`);

    var dir     = `${__dirname}/../backups/`;
    var endDate     = new Date();
    console.log(endDate);

    async.waterfall([
        function (callback) {
            var data    = '';

            request.addListener('data', (chunk) => data += chunk);
            request.addListener('end', () => {
                data = JSON.parse(data);

                createLog('==============================');
                createLog(`      information added       `);
                createLog('==============================');
                createLog(`[data] : ${sObj(data)}`);

                callback(null, data)
            });
        },
        function (data, callback) {
            fs.readdir(dir, (err, files) => {
                if (err) return callback(createLog(`[err] : ${err}`));
                if (files.length == 0) return callback(createLog(`[err] : no files in directory`));

                createLog('==============================');
                createLog(`      checking files date     `);
                createLog('==============================');

                for (const file of files) {
                    q.push({
                        file    : file,
                        range   : data.range
                    }, () => {});
                }

                q.drain = () => {
                    callback(null);
                };
            });
        }
    ],
    function (err, result) {
        if (err) createLog(`[err] : ${err}`);
        createLog();
        createLog('==============================');
        createLog('             time             ');
        createLog('==============================');
        createLog(timecheck());
        console.log(ll);
        response.write(ll);
        response.end();
    });

    var q = async.queue(function(data, callback) {
        fs.stat(`${dir}/${data.file}`, function(err, stats) {

            var startDate = moment().subtract(data.range, 'days').format().toString();

            createLog(`[file]       : ${data.file}`);
            createLog(`[ranges]     :_${startDate}_ <---?? ${stats.birthtime} ??---> _${endDate}_`);
            createLog(`[in range]   : ${dates.inRange(stats.birthtime, startDate, endDate)}`);

            filesToDeleteQueue.push({
                name: data.file,
                path: dir,
                delete: !dates.inRange(stats.birthtime, startDate, endDate)
            }, () => {});

            filesToDeleteQueue.drain = () => {
                callback();
            };
        });
    }, 1);

    var filesToDeleteQueue = async.queue(function(file, callback) {
        if (file.delete == true) {
            fs.unlink(`${file.path}/${file.name}`, (err) => {
                callback(createLog(err ? `[err] : ${err}` : `[file]       : ${file.name} deleted\n`))
                createLog();
            });
        } else {
            callback(createLog(`[file]     : ${file.name} not deleted\n`));
            createLog();
        }
    }, 1);
}

exports.getDataForBackup = getDataForBackup;
exports.cleanBckps = cleanBckps;
