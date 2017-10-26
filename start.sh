#!/bin/sh

# install pm2 if u need
#npm install pm2 -g
pm2 startup upstart

sudo env PATH=$PATH:/usr/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp /home/$USER

# change index.js on your root file .js
pm2 start index.js

pm2 save
# if your server didn't powered up after system reboot
# pm2 startup -u nodeuser

# if error via connecting then try to check your node js
# if node js switched off then turn on it
# than use this command to delete all servers and after that
# use start.sh again without this script
# pm2 delete all