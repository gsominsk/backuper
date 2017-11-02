var http = require("http");
var url = require("url");
var logtext = require('../helpers/logtext');

function start(route, handle) {
  function onRequest(request, response) {
    var pathname = url.parse(request.url).pathname;
    //logtext.log("Request for " + pathname + " received.");
    route(handle, pathname, response, request);
  }

  var server = http.createServer(onRequest).listen(1071);

  server.on('clientError', (err, socket) => {
      logtext.log('HTTP/1.1 400 Bad Request');
      socket.end('HTTP/1.1 400 Bad Request');
    });

    server.on('connect', (request, socket, head) => {
        logtext.log('connect');
    });

    server.on('connection', (socket) => {
         logtext.log('connection');
    });
}

exports.start = start;
