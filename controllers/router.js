var logtext = require('../helpers/logtext');
var fs      = require('fs');


function route(handle, pathname, response, request) {
  //logtext.log("About to route a request for " + pathname);
  var config = JSON.parse(fs.readFileSync('config/paths.json', 'utf8'));


  if (typeof handle[pathname] === 'function') {
    handle[pathname](response, request);
  }
  else if (fs.existsSync(`${config.toFiles}${pathname}`)) {
    fs.readFile(`${config.toFiles}${pathname}`, 'utf8', function (err, data) {
        if (err) throw err;

        var fileStream = fs.createReadStream(`${config.toFiles}${pathname}`);
        fileStream.on('open', function () {
            fileStream.pipe(response);
        });
    });
  } else {
    logtext.log("No request handler found for " + pathname);
    response.writeHead(404, {"Content-Type": "text/html"});
    response.write("404 Not found");
    response.end();
  }
}

exports.route = route;
