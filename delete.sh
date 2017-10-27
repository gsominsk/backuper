#!/bin/sh

generate_post_data()
{
  cat <<EOF
{
  "range": "0"
}
EOF
}


curl -i \
-H "Accept: application/json" \
-H "Content-Type: application/json" \
-X POST --data "$(generate_post_data)" "localhost:1070/deleteLocalBackups"
