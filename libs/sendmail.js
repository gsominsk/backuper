var logtext = require('../helpers/logtext');
var SMTPConnection = require('smtp-connection');
var nodemailer = require('nodemailer');

function sendMail(response,request){
    logtext.log("Request handler 'sendMail' was called.");
    let data = '';

    request.addListener('data', function(chunk) {
      data += chunk;
    });
    request.addListener('end', function() {
        try {
            var dataobj = JSON.parse(data);
            response.writeHead(200, {"Content-Type": "text/html"});
            response.write("JSON OK");
            response.end();

            let options = {
                //service : "Gmail",
                port : dataobj.port,
                host : dataobj.host,
                auth : {
                    type : "login",
                    user : dataobj.user,
                    pass : dataobj.pass
                },
                authMethod : "PLAIN",
                secure : dataobj.secure
            };
            let defaults = {};

            let transporter = nodemailer.createTransport(options,defaults);
            // verify connection configuration
            transporter.verify(function(error, success) {
               if (error) {
                    logtext.log(error);
               } else {
                    logtext.log('Server is ready to take our messages');
                    let message = {
                        from: dataobj.from,
                        to: dataobj.to,
                        subject: dataobj.subject,
                        text: dataobj.message + '\n',
                        attachments : dataobj.attachments
                        //html: '<p>HTML version of the ' + dataobj.message + '</p>'
                    };
                    transporter.sendMail(message, function(err){
                        if(err){
                            logtext.log(err);
                        }
                    });
               }
            });

        } catch (e) {
            response.writeHead(200, {"Content-Type": "text/html"});
            response.write("ERROR JSON");
            response.end();
            logtext.error(data);
            return logtext.error(e);
        }
    });
}

exports.sendMail = sendMail;
