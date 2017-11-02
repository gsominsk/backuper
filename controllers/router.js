var logtext = require('../helpers/logtext');
var fs      = require('fs');
const path  = require('path');
const http  = require('http');

var config = JSON.parse(fs.readFileSync('config/paths.json', 'utf8'));

const mimeType = {
    '.ico': 'image/x-icon',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.eot': 'appliaction/vnd.ms-fontobject',
    '.ttf': 'aplication/font-sfnt'
  };

function route(handle, pathname, response, request) {
  //logtext.log("About to route a request for " + pathname);
  if (typeof handle[pathname] === 'function') {
    handle[pathname](response, request);
  }
  else if (pathname.search(/.hal/ig) != -1) {
    var options = {
        host: 'http://localhost:1088',
        path: pathname
    };

    http.request(options, (response) => {
        console.log(response);
    }).end();
  }
  else if (fs.existsSync(`${config.toFiles}${pathname}`)) {
    fs.readFile(`${config.toFiles}${pathname}`, 'binary', function (err, data) {
        if (err) throw err;
	
        const ext = path.parse(pathname).ext;
        response.writeHead(200, {"Content-Type": mimeType[ext] || 'text/plain'});
        response.end(data,"binary");
    });
  } else {
    logtext.log("No request handler found for " + pathname);
    response.writeHead(404, {"Content-Type": "text/html"});
    response.write("404 Not found");
    response.end();
  }
}

exports.route = route;
