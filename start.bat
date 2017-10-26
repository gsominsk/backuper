:: installing pm2 if already installed u can comment next line
npm install pm2 -g

:: installing pm2-windows-startup if already installed u can comment next line
npm install pm2-windows-startup -g

:: run pm2 startup for initializing
pm2-startup install

:: Change index.js on your root .js file
pm2 start index.js

:: Saving for system reboot switch up
pm2 save

:: just for check
:: timeout /t 40