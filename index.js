var requestHandlers = require("./controllers/requestHandlers");
var server          = require("./controllers/server");
var router          = require("./controllers/router");
var backups         = require("./libs/backups");
var sendmail        = require("./libs/sendmail");

var handle = {};
handle["/"] = requestHandlers.start;
handle["/start"] = requestHandlers.start;
handle["/upload"] = requestHandlers.upload;
handle["/show"] = requestHandlers.show;
handle["/getProxyRequest"] = requestHandlers.getProxyRequest;
handle["/sendMail"] = sendmail.sendMail;
handle["/getCurTime"] = requestHandlers.getCurTime;
handle["/index"] = requestHandlers.index;
handle["/getPosImage"] = requestHandlers.getPosImage;
handle["/setUserImage"] = requestHandlers.setUserImage;
handle["/setUserImageUsingAbsPath"] = requestHandlers.setUserImageUsingAbsPath;
// handle["/makeBackup"] = backups.makeBackupViaFTP;
handle["/makeBackup"] = backups.getDataForBackup;
handle["/deleteLocalBackups"] = backups.cleanBckps;
// handle["/makeArchive"] = backups.makeArchive;
// handle["/sendBackupToServer"] = backups.sendBackupFilesThroughSSH;

server.start(router.route, handle);
