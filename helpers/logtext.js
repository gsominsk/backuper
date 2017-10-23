var log4js = require('log4js');
log4js.loadAppender('file');
//log4js.addAppender(log4js.appenders.console());
log4js.addAppender(log4js.appenders.file('log.txt'));
//console log is loaded by default, so you won't normally need to do this
//log4js.loadAppender('console');

function log(text){

    var logger = log4js.getLogger();
    logger.setLevel('TRACE');
    logger.trace(text);
    /*logger.debug('Got cheese.');
    logger.info('Cheese is Gouda.');
    logger.warn('Cheese is quite smelly.');
    logger.error('Cheese is too ripe!');
    logger.fatal('Cheese was breeding ground for listeria.');*/
}
function error(text){

    var logger = log4js.getLogger();
    logger.setLevel('TRACE');
    //logger.trace(text);
    //logger.debug('Got cheese.');
    //logger.info('Cheese is Gouda.');
    //logger.warn('Cheese is quite smelly.');
    logger.error(text);
    //logger.fatal('Cheese was breeding ground for listeria.');
}

exports.log = log;
exports.error = error;
