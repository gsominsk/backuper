
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
                q.push({obj:data.bckps[i], config:data.config, unique: i})
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
                },
                // удаление файла сразу после отправки на сервер
                // function(callback) {
                //     cleanBckps(() => callback(null, 1));
                // }
            ],
            function(err, results) {
                response.write(ll);
                response.end();
            });
        };
    });
}

// archiving files and folders

function createArchive(bckp, config, unique, callback) {
    createLog('[creating archive] ...');

    var now         = new Date();
    var dirOrFile   = bckp.filename.trim().length == 0;
    var bckpName    = `${__dirname}/../backups/bckp_${unique}_${now.getYear()}-${now.getMonth()}-${now.getDay()}_${now.getHours()}-${now.getMinutes()}.zip`;
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
        q.push(files[i], false);

    q.drain = () => callback(c.end());
}

function sendFilesViaSFTP (files, config, response, callback) {
    createLog(`[Get into sendFilesViaSFTP] ...`);

    var q = async.queue((file, callback) => {
        var name = file.name.split('/')[file.name.split('/').length - 1];
        client.scp(file, {
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.passwd,
            path: `${file.backupPath}/${name}.gz`
        }, function(err) {
            if (err) {
                createLog(`[err] : ${err}`);
                return callback(null);
            }
            createLog(`[file] : ${name}.gz`);
            createLog(`[path] : ${file.backupPath}/${name}.gz `);
            createLog(`[file added via sftp] ...`);

            callback(name);
        });
    }, 1);

    for (var i = 0; i < files.length; i++)
        q.push(files[i], false);

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

    response.writeHead(200, {"Content-Type": "text/html"});

    createLog('==============================');
    createLog(`        deleting files        `);
    createLog('==============================');

    var dir = `${__dirname}/../backups/`;
    var data        = '';
    var now = new Date;

    request.addListener('data', (chunk) => data += chunk);
    request.addListener('end', () => {
        data = JSON.parse(data);
        createLog(data);

        fs.readdir(dir, (err, files) => {
            if (err) return callback(createLog(`[err] : ${err}`));

            var q = async.queue(function(file, callback) {
                createLog(`[file] : ${file}`);

                // callback();
                fs.stat(`${dir}/${file}`, function(err, stats) {
                    console.log(stats.birthtime);
                    console.log(new Date());

                    var d = moment().subtract(6, 'days');
                    console.log(d);
                    console.log(d.match(/(?:\".*\")/ig)[0]);
                    console.log(d.match(/(?:\".*\")/ig)[0].substring(1, d.length - 1));

                    callback();
                });
            }, 1);

            for (const file of files) {
                q.push(file, false);
            }

            q.drain = () => {
                response.write(ll);
                response.end();
            };
        });
    });
}

/**
 * OLD VERSION
 */
/*
// tested, working
function makeBackupViaFTP(response,request){
    response.writeHead(200, {"Content-Type": "text/html"});

    var data = '';
    ll = '';
    createLog(`[Request handler 'copyFileToFTP' was called.] ... \n`);

    request.addListener('data', function(chunk) {
        data += chunk;
        createLog('==========================================');
        createLog(`[data] : ${data}`);
        createLog('==========================================');
    });

    request.addListener('end', function() {        //logtext.log('connect');
        try {
            let dataobj = JSON.parse(data);
            if(dataobj.folder[dataobj.folder.length-1]!='/')
                dataobj.folder = dataobj.folder + '/';
            logtext.log(dataobj.folder[dataobj.folder.length-1]);
            fs.exists(dataobj.folder, (exists) => {
                createLog('=========================================='); // log
                createLog(`[folder exists] : ${exists}\n`); // log
                createLog(`[folder path] : ${dataobj.folder}\n`); // log
                createLog('=========================================='); // log
            });
            if(dataobj.folder + dataobj.filename){
                let filenotfound = false;
                fs.exists(dataobj.folder + dataobj.filename, (exists) => {
                    if (exists) {
                        createLog(`[GZIP Start] ...\n`); // log
                        var gzip = zlib.createGzip();
                        var inp = fs.createReadStream(dataobj.folder + dataobj.filename);
                        var out = fs.createWriteStream(dataobj.folder + dataobj.filename + '.gz');
                        inp.pipe(gzip).pipe(out);
                        inp.on('close',function(){
                            createLog(`[GZIP Done] ...\n`); // log
                            fs.exists(dataobj.folder + dataobj.filename + '.gz', (exists) => {
                                if (exists) {
                                    createLog(`[delete file] : ${dataobj.folder + dataobj.filename}\n`); // log
                                    // fs.unlink(dataobj.folder + dataobj.filename); // !!!потом раскоментить!!!
                                    if(dataobj.protocol=="FTP"){
                                        let c = new ftpClient();
                                        let cdata = {
                                            host:  dataobj.host,
                                            port: dataobj.port,
                                            user: dataobj.user,
                                            password: dataobj.passwd
                                        };
                                        c.connect(cdata);
                                        createLog(`[connecting] ... \n`); // log
                                        c.on('ready', function() {
                                            createLog(`[connected] ... \n`); // log
                                            createLog(`[this file] : ${dataobj.folder + dataobj.filename}.gz \n`); // log
                                            createLog(`[put in this direcory] : ${dataobj.backuppath}/${dataobj.filename}.gz \n`); // log
                                            c.on('jsftp_debug', function(eventType, data) {
                                                console.log('DEBUG: ', eventType);
                                                console.log(JSON.stringify(data, null, 2));

                                                response.write(ll);
                                                response.end();
                                            });
                                            c.put(dataobj.folder + dataobj.filename + '.gz',
                                                dataobj.backuppath + '/' + dataobj.filename + '.gz',
                                                function(e) {
                                                if (e) throw e;
                                                    createLog(`[file] : ${dataobj.filename}.gz \n`); // log
                                                    createLog(`[path] : ${dataobj.backuppath}/${dataobj.filename}.gz \n`); // log
                                                    createLog(`[file added ftp] ... \n`); // log
                                                    response.write(ll);
                                                    response.end();
                                                    c.end();
                                                });
                                        });
                                        c.on('error',function(error){
                                            console.log(error);
                                            createLog(`[err] : ${error}\n`); // log

                                            response.write(ll);
                                            response.end();
                                        });
                                    }
                                    if(dataobj.protocol=="SFTP"){
                                        client.scp(dataobj.folder + dataobj.filename + '.gz', {
                                            host: dataobj.host,
                                            port:dataobj.port,
                                            username: dataobj.user,
                                            password: dataobj.passwd,
                                            path: dataobj.backuppath
                                        }, function(err) {
                                            err ?
                                                createLog(`[err] : ${err}\n`)
                                                : createLog(`[upload completed sftp]\n`);

                                            response.write(ll);
                                            response.end();

                                        });
                                    }
                                } else {
                                    response.write(ll);
                                    response.end();
                                }
                            });
                        });
                    } else {
                        filenotfound = true;
                    }
                });
                if(filenotfound){
                    createLog(`[try found file] ...\n`); // log
                    fsnew.exists(dataobj.folder + dataobj.filename + '.gz', (exists1) => {
                        if (exists1) {
                            createLog(`[file found] : ${dataobj.folder}${dataobj.filename}.gz\n`); // log
                        }
                        response.write(ll);
                        response.end();
                    });
                }
            }
        } catch (e) {
            createLog(`[err] : ${e}\n`);
            response.write(ll);
            response.end();
            return logtext.error(e);
        }
    });
}

// -
function sendBackupFilesThroughSSH(response, request) {
  console.log(request);

    var backupScenarios = [{
        idName: "FM_Daily",
        pathToBackupFiles: "C:/Program Files/FileMaker/FileMaker Server/Data/Backups/",
        fileNameTemplate: "Daily_",
        maxBackupFilesToServer: 1,
        runSendBackupFilesAtTime: "19:00",
        targetDirectory: "/usr/local/bin/BackupsFromAnotherServer/FileMaker/"
    }, {
        idName: "FM_Weekly",
        pathToBackupFiles: "C:/Program Files/FileMaker/FileMaker Server/Data/Backups/",
        fileNameTemplate: "Weekly_",
        maxBackupFilesToServer: 0,
        runSendBackupFilesAtTime: "19:00",
        targetDirectory: "/usr/local/bin/BackupsFromAnotherServer/FileMaker/"
    }];

  var backupsInfoHolder = [];
  var prevDoneBackupsList = {};
  var actualDoneBackupsList = {};
  var tempIndex = 0;
  var curScenario = null;

  logtext.log("\n\n\n");
  logtext.log("Start backuping...");

  let idNameList = {};
  let error = false;
  for (var i = 0; i < backupScenarios.length; i++) {
    if (backupScenarios[i].hasOwnProperty('idName') == false) {
      logtext.log("'idName' property undefined");
      error = true;
    }
    if (!error) {
      if (idNameList.hasOwnProperty(backupScenarios[i].idName) == false) {
        idNameList[backupScenarios[i].idName] = true;
      } else {
        logtext.log("ID name '" + backupScenarios[i].idName + "' is not unique!");
        error = true;
      }
    } else {
      logtext.log("Backuping process interrupted");
      return;
    }
  }

  if (fs.existsSync(__dirname + "/doneBackupsList.txt")) {
    try {
      prevDoneBackupsList = JSON.parse(fs.readFileSync(__dirname + "/doneBackupsList.txt", 'utf8'));
    } catch (err) {
      logtext.log("JSON parse error: \n" + err);
    }
  }
  //return;

  for (var i = 0; i < backupScenarios.length; i++) {
    curScenario =  backupScenarios[i];
    logtext.log(" Scenario '" + curScenario.idName + "'");

    if (fs.existsSync(curScenario.pathToBackupFiles)) {
      let backupDirItemList = fs.readdirSync(curScenario.pathToBackupFiles
      ).filter(function(index) {
        let fileNameTemp = curScenario.fileNameTemplate;
        return (index.substr(0, fileNameTemp.length) === fileNameTemp);
      }).map(function(index) {
        return join(curScenario.pathToBackupFiles, index);
      }).sort(function (a, b) {
        return a == b? 0: a<b ? 1: -1;
      });
      if (curScenario.maxBackupFilesToServer != undefined &&
          backupDirItemList.length > curScenario.maxBackupFilesToServer) {
        backupDirItemList = backupDirItemList.slice(0,curScenario.maxBackupFilesToServer);
        logtext.log("Number of backups was limited to " + curScenario.maxBackupFilesToServer);
      }

      tempIndex = backupsInfoHolder.length;
      if (backupsInfoHolder[tempIndex] === undefined) {
        backupsInfoHolder[tempIndex] = {};
      }
      backupsInfoHolder[tempIndex].scenario = curScenario;
      backupsInfoHolder[tempIndex].backupDirItemList = backupDirItemList;
      backupsInfoHolder[tempIndex].backupedList = [];

      actualDoneBackupsList[curScenario.idName] = [];
      if (prevDoneBackupsList.hasOwnProperty(curScenario.idName)) {
        actualDoneBackupsList[curScenario.idName] = prevDoneBackupsList[curScenario.idName];
        if (actualDoneBackupsList[curScenario.idName] === undefined) {
          actualDoneBackupsList[curScenario.idName] = [];
        }
      }
    } else {
      logtext.log(curScenario.idName + ". No such directory: " + curScenario.pathToBackupFiles);
    }
  }
  // makeArchive(backupsInfoHolder,actualDoneBackupsList,0,0);
}

// Failed to make zip by JSZip and AdmZip, used Archiver
function makeArchive(backupsInfoHolder,actualDoneBackupsList,scIndex,dirItemIndex) {

  if (scIndex == undefined) {
    scIndex = 0;
  }
  if (dirItemIndex == undefined) {
    dirItemIndex = 0;
  }
  if (scIndex >= backupsInfoHolder.length) {
    createLog('[makeSSHTrasmit in]');
    createLog('[backupsInfoHolder.length] : ');
    createLog(backupsInfoHolder.length+'\n');
    createLog('[backupsInfoHolder] : ' + backupsInfoHolder + '\n');
    createLog('[scIndex] : ' + scIndex + '\n');
    // makeSSHTrasmit(backupsInfoHolder,actualDoneBackupsList,null,0,0);
    return;
  }

  let curInfoHolder = backupsInfoHolder[scIndex];
  if (dirItemIndex == 0) {
    logtext.log('Current backuping process ' + curInfoHolder.scenario.idName);
  }
  if (dirItemIndex >= curInfoHolder.backupDirItemList.length) {
    makeArchive(backupsInfoHolder,actualDoneBackupsList,scIndex += 1,0);
    return;
  }

  let curBackupItem = curInfoHolder.backupDirItemList[dirItemIndex];
  let outFileName = curBackupItem.slice(curBackupItem.lastIndexOf(path.sep)+1);
  if (outFileName) {
    if (fs.lstatSync(curBackupItem).isFile() && ~outFileName.lastIndexOf(".")) {
      outFileName = outFileName.slice(0,curBackupItem.lastIndexOf("."));
    }
    outFileName = outFileName  + '.zip'
    let zipFileName = path.dirname(curBackupItem) + path.sep + outFileName;

    let prevArchivedList = actualDoneBackupsList[curInfoHolder.scenario.idName];
    var isAlreadyZipped = false;
    for (var i = 0; i < prevArchivedList.length; i++) {
      if (prevArchivedList[i] == outFileName) {
        isAlreadyZipped = true;
        i = prevArchivedList.length;
      }
    }
    if (!isAlreadyZipped) {
      let output = fs.createWriteStream(zipFileName);
      let archive = archiver('zip', {
          zlib: { level: 9 } // Sets the compression level. Z_BEST_COMPRESSION = 9.
      });

      output.on('close', function() {
        logtext.log(curBackupItem + ' has been archived');
        logtext.log(archive.pointer() + ' total bytes');
        //logtext.log('archiver has been finalized and the output file descriptor has closed.');
        curInfoHolder.backupedList.push(outFileName);
        makeArchive(backupsInfoHolder,actualDoneBackupsList,scIndex,dirItemIndex+=1)
      });

      archive.on('error', function(err) {
        //throw err;
        logtext.log('Archive error: ' + err);
      });

      archive.pipe(output);
      archive.directory(curBackupItem, false);
      archive.finalize();
    }
  }
}

function makeSSHTrasmit(backupsInfoHolder,actualDoneBackupsList, SSHConfig,scIndex,backupIndex) {
  var SSHClient;

  if (scIndex == undefined) {
    scIndex = 0;
  }
  if (backupIndex == undefined) {
    backupIndex = 0;
  }
  if (scIndex >= backupsInfoHolder.length) {
    logtext.log('SSH transmission finished');
    if (SSHClient != undefined) {
      SSHClient.close();
    }
    return;
  }
  if (backupIndex >= backupsInfoHolder[scIndex].backupedList.length) {
    makeSSHTrasmit(backupsInfoHolder,actualDoneBackupsList,SSHConfig,
      scIndex +=1,0);
    return;
  }

  SSHClient = SSHConfig;
  if (SSHClient == undefined) {
    let prKey = fs.readFileSync(__dirname + "/BackupKey", 'utf8');

    SSHClient = new client.Client();
    SSHClient.defaults({
      port: 22,
      host: '144.76.186.251',
      username: 'norn',
      privateKey: prKey
    });
    logtext.log('SSH transmission started');
  }

  let curInfoHolder = backupsInfoHolder[scIndex];
  let archivedFile = curInfoHolder.scenario.pathToBackupFiles + curInfoHolder.backupedList[backupIndex];
  SSHClient.upload(archivedFile,curInfoHolder.scenario.targetDirectory,
    function(err) {
      if(err){
        logtext.log(err);
      }else{
        logtext.log('Uploaded: ' + curInfoHolder.backupedList[backupIndex]);
        fs.unlinkSync(archivedFile);
      }
      //makeSSHTrasmit(backupsInfoHolder,actualDoneBackupsList,SSHConfig,scIndex,backupIndex += 1);
  });
}

function sleep(milliseconds) {
  var start = new Date().getTime();
  while ((new Date().getTime() - start) <= milliseconds){}
}

// exports.makeBackupViaFTP = makeBackupViaFTP;
// exports.makeArchive = makeArchive;
// exports.sendBackupFilesThroughSSH = sendBackupFilesThroughSSH;

*/

exports.getDataForBackup = getDataForBackup;
exports.cleanBckps = cleanBckps;
