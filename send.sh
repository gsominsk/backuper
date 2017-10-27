#!/bin/sh

#C:\\Program Files\\FileMaker\\FileMaker Server\\Data\\Backups

DATE=$(date +"%Y-%m-%d")
filename="C:\\Program Files\\FileMaker\\FileMaker Server\\Data\\Backups\\Daily_${DATE}_2300"

test="C:\\Program Files\\FileMaker\\FileMaker Server\\Data\\Backups\\Daily_2017-10-26_2300"

echo $filename

generate_post_data()
{
  cat <<EOF
{
  "config": {
    "protocol":"SFTP",
    "host":"s.bpi.in.ua",
    "port":"22",
    "user":"norn",
    "passwd":"c2h5ohbrew"
  },
  "bckps": [{
    "folder":"C:/Program Files/FileMaker/FileMaker Server/Data/Backups/Daily_2017-10-26_2300",
    "filename":"",
    "backuppath": "/mnt/Files/",
    "maxBackupFilesToServer": ""
  }]
}
EOF
}

echo $(generate_post_data)

curl -i \
-H "Accept: application/json" \
-H "Content-Type:application/json" \
-X POST --data "$(generate_post_data)" "localhost:1070/makeBackup"
