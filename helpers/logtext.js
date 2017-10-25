var log4js = require('log4js');

var logger = log4js.getLogger();
logger.level = 'debug';

function log(text){
    logger.trace(text);
}
function error(text){
    logger.error(text);
}

exports.log = log;
exports.error = error;
