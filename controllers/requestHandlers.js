
var logtext = require('../helpers/logtext');
var SMTPConnection = require('smtp-connection');
var nodemailer = require('nodemailer');

const url = require('url');

var querystring = require("querystring"),
    fs = require("fs"),
    formidable = require("formidable");
    const https = require('https');
    const http = require('http');

var pathToView = 'views/'

function start(response) {
    logtext.log("Request handler 'start' was called.");

    fs.readFile(`${pathToView}start/Start.html`, 'utf8', function(err, contents) {
        if (err) return console.error('Taison we have a trouble. File doesnt exists!\n', err);
        else console.log('File Start.html was uploaded succesfuly.\n', contents);
        let body = contents;

        response.writeHead(200, {"Content-Type": "text/html"});
        response.write(body);
        response.end();
    });

}

function upload(response, request) {
  logtext.log("Request handler 'upload' was called.");

  var form = new formidable.IncomingForm();
  logtext.log("about to parse");
  form.parse(request, function(error, fields, files) {
    logtext.log("parsing done");

    /* Possible error on Windows systems:
       tried to rename to an already existing file */
    fs.rename(files.upload.path, "/tmp/test.png", function(err) {
      if (err) {
        fs.unlink("/tmp/test.png");
        fs.rename(files.upload.path, "/tmp/test.png");
      }
    });
    response.writeHead(200, {"Content-Type": "text/html"});
    response.write("received image:<br/>");
    response.write("<img src='/show' />");
    response.end();
  });
}

function show(response) {
  logtext.log("Request handler 'show' was called.");
  response.writeHead(200, {"Content-Type": "image/png"});
  fs.createReadStream("/tmp/test.png").pipe(response);
}

function requestfun(res,dataobj){
    logtext.log('requestfun');
    let resultdata = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        resultdata += chunk;
    });
    res.on('end', () => {
    //console.log(resultdata);

    let getstring = '';
    if(dataobj.callbackgetdata){
        getstring = dataobj.callbackgetdata;
    }
    let optionstohansa = {
        hostname: dataobj.callbackhost,
        port: dataobj.callbackport,
        path: dataobj.callbackpage + getstring,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(resultdata)
        }
    };
    //logtext.log(Buffer.byteLength(resultdata));
    let reqtohansa = http.request(optionstohansa, (res) => {
        res.setEncoding('utf8');
        res.setTimeout(5000);
        res.on('data', (chunk) => {
            //logtext.log(`BODY: ${chunk}`);
        });
        res.on('end', () => {
            //logtext.log('Done!');
        });
        res.on('error', (err) => {
            logtext.error("ERROR REQUEST");
            return logtext.error(err);
        });
    });
    reqtohansa.on('error', function(err) {
        logtext.error("ERROR REQUEST");
        return logtext.error(err);
    });
    logtext.log('CallBackRequest to ' + dataobj.callbackhost + ':' + dataobj.callbackport + ' ' + dataobj.callbackpage + ' sizeof ' + Buffer.byteLength(resultdata) + ' bytes');
    reqtohansa.write(resultdata);
    reqtohansa.end();
  });
}

function getProxyRequest(response,request) {
    var data = '';
    logtext.log("Request handler 'getProxyRequest' was called.");

    request.addListener('data', function(chunk) {
      data += chunk;
    });

    request.addListener('end', function() {
        try {
            let dataobj = JSON.parse(data);
            response.writeHead(200, {"Content-Type": "text/html"});
            response.write("JSON OK");
            response.end();
            let conttype = 'text/xml';
            if(dataobj.contenttype){
                conttype = dataobj.contenttype;
            }
            let method = "POST";
            if(dataobj.method){
                method = dataobj.method;
            }
            let clenth = 0;
            if(dataobj.xmldata){
                clenth = Buffer.byteLength(dataobj.xmldata);
            }
            let options = {
              hostname: dataobj.host,
              port: dataobj.port,
              path: dataobj.page,
              method: method,
              headers: {
                'Content-Type': conttype,
                'Content-Length': clenth
              }
            };
            if(dataobj.Authorization){
                options.headers['Authorization'] = dataobj.Authorization;
            }
            if(dataobj.Accept){
                options.headers['Accept'] = dataobj.Accept;
            }

            console.log(dataobj.xmldata);
            console.log(options);
            logtext.log('Prepare to request to ' + dataobj.host + ':' + dataobj.port + ' ' + dataobj.page);
            try {
                if(dataobj.https==true){
                    //logtext.log('HTTPS');
                    let req = https.request(options, (res) => {requestfun(res,dataobj)});
                    req.on('error', function(err) {
                        logtext.error("ERROR REQUEST");
                        return logtext.error(err);
                    });
                    if(dataobj.xmldata){
                        req.write(dataobj.xmldata);
                    }else{
                        req.write("OK");
                    }
                    logtext.error(dataobj.xmldata);
                    req.end();
                }else{
                    //logtext.log('HTTP');
                    let req = http.request(options, (res) => {requestfun(res,dataobj)});
                    req.on('error', function(err) {
                        logtext.error("ERROR REQUEST");
                        return logtext.error(err);
                    });
                    req.write(dataobj.xmldata);
                    req.end();
                }
            } catch (e) {
                logtext.error("ERROR REQUEST");
                return logtext.error(e);
            }
        } catch (e) {
            response.writeHead(200, {"Content-Type": "text/html"});
            response.write("ERROR JSON");
            response.end();
            logtext.error("ERROR JSON");
            logtext.error(data);
            return logtext.error(e);
        }
    });
}

function index(response,request){
    //let data = fs.createReadStream('Index.html');
    //console.log(request + 'sdfdfsd');
    let user = querystring.parse(url.parse(request.url).query).user;
    if (user) {
      users[user] = null;
    }
    fs.readFile('./../views/index/Index.html', function(err, data){
        if (err) {
            response.writeHead(200, {   "Content-Type": "text/html",
                                        "Cache-Control" : "no-cache",
                                        "Expires" : -1,
                                        "Pragma" : "no-cache"});
            response.end();
            throw err;
        }
        console.log(user);
        data = data.toString('utf8').replace(/getPosImage/g, 'getPosImage?user='+user);
        response.writeHead(200, {"Content-Type": "text/html"});
        response.write(data);
        response.end();
    });
    logtext.log("Request handler 'index' was called.");
}

function getCurTime(response,request){
    logtext.log("Request handler 'getCurTime'");
    try {
        fs.readFile('./usertime.txt', function(err, data){
        response.writeHead(200, {"Content-Type": "text/html"});
        response.write(data);
        response.end();

    });
    }catch (err) {
      logtext.log('FileNotFound' + err);
      response.writeHead(200, {"Content-Type": "text/html"});
      response.write('filenotfound');
      response.end();
    }


}

function getPosImage(response,request){
    let user = querystring.parse(url.parse(request.url).query).user;

    response.writeHead(200, {   "Content-Type": "text/html",
                                "Cache-Control" : "no-cache",
                                "Expires" : -1,
                                "Pragma" : "no-cache"});
    try {
        if(users[user].user==user){
            if(user=='SA'){
                //logtext.log('setPOSImage  ' + users[user].imagepath);
            }
            response.write(users[user].imagepath);
        }else{
            response.write('users[user].imagepath');
        }
    }catch(err){

    }
    response.end();
}

var users = {};
function setUserImage(response,request){
    let user = querystring.parse(url.parse(request.url).query).user;
    let artcode = querystring.parse(url.parse(request.url).query).artcode;
    let imagepathlet = '<div><img height=150 src="';
    imagepathlet += 'https://www.rybray.com.ua/get-image.php?sku=' + artcode;
    imagepathlet += '"/></div>';

    if(user){
        let userimage = {};
        userimage['user'] = user;
        userimage['artcode'] = artcode;
        userimage['imagepath'] = imagepathlet;
        users[user] = userimage;
    }
    response.writeHead(200, {"Content-Type": "text/html"});
    response.write('OK');
    response.end();
}

function setUserImageUsingAbsPath(response,request){
    let user = querystring.parse(url.parse(request.url).query).user;
    let artcode = querystring.parse(url.parse(request.url).query).artcode;
    let filepathC = querystring.parse(url.parse(request.url).query).filepathC;
    let imagepathlet = '';
    if (user) {
      users[user] = null;
    }
    //logtext.log('filepathC ' + filepathC + ' user ' + user + ' artcode ' + artcode);
    if (filepathC) {
      try{
        fs.readFile(filepathC, function(err, data) {
          if (err) logtext.log(err); //throw err; // Fail if the file can't be read.
          if (data) {
            imagepathlet += '<div><img height=300px src="data:image/jpeg;base64,';
            imagepathlet += new Buffer(data).toString('base64');
            imagepathlet += '"/></div>';
            let userimage = {};
            userimage['user'] = user;
            userimage['artcode'] = artcode;
            userimage['imagepath'] = imagepathlet;
            users[user] = userimage;
          }
        });
      }catch (err) {
        logtext.log(err);
      }
    }
    else {
      imagepathlet = '<h1>No image for item ' + artcode + '</h1>';
    }

    if(user){
        let userimage = {};
        userimage['user'] = user;
        userimage['artcode'] = artcode;
        userimage['imagepath'] = imagepathlet;
        users[user] = userimage;
    }
    response.writeHead(200, {"Content-Type": "text/html"});
    response.write('OK');
    response.end();
}

exports.setUserImageUsingAbsPath = setUserImageUsingAbsPath;
exports.setUserImage = setUserImage;
exports.getPosImage = getPosImage;
exports.getCurTime = getCurTime;
exports.getProxyRequest = getProxyRequest;
exports.start = start;
exports.upload = upload;
exports.show = show;
exports.index = index;
