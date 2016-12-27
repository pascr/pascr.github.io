---
layout:            post
title:             "Secure Nginx with Let's Encrypt SSL certificates on Ubuntu"
menutitle:         "Secure Nginx with Let's Encrypt SSL certificates on Ubuntu"
category:          Programming
author:            pascr
tags:              ssl certificate nginx
---

I recently had to create a SSL secured developement environement. Let’s Encrypt is a relatively recent certificate authority (CA) offering free and automated SSL/TLS certificates. Certificates issued by Let’s Encrypt are trusted by most browsers in production today.

### Step by step guide (Nginx and Ubuntu)

Install the Let’s Encrypt client.

```bash
$ sudo apt-get update
$ sudo apt-get install -y git
$ sudo git clone https://github.com/letsencrypt/letsencrypt /opt/letsencrypt
$ cd /opt/letsencrypt
$ sudo ./letsencrypt-auto
```

Create the directory where Let’s Encrypt will store its temporary file and set the required permissions.

```bash
$ cd /var/www
$ mkdir letsencrypt
$ sudo chgroup www-data letsencrypt
```

Create a Let’s Encrypt configuration file for your domain /etc/letsencrypt/configs/<my-domain>, replace <my-domain> and <my-email> respectively with your fully qualified domain name and your email address.

```
# the domain we want to get the cert for;
# technically it's possible to have multiple of this lines, but it only worked with one domain for me,
# another one only got one cert, so I would recommend sepaate config files per domain.
domains = <my-domain>
 
# increase key size
rsa-key-size = 4096
 
# the current closed beta (as of 2015-Nov-07) is using this server
server = https://acme-v01.api.letsencrypt.org/directory
 
# this address will receive renewal reminders, IIRC
email = <my-email>
 
# turn off the ncurses UI, we want this to be run as a cronjob
text = True
 
# authenticate by placing a file in the webroot (under .well-known/acme-challenge/) and then letting
# LE fetch it
authenticator = webroot
webroot-path = /var/www/letsencrypt
```

Configure nginx by adding this location block to the virtual server for HTTP traffic

```
server {
    listen 80;
 
    location / {  # the default location redirects to https
        return 301 https://$server_name$request_uri;
    }
 
    location '/.well-known/acme-challenge/' {
        root        /var/www/letsencrypt;
    }
}
```

Verify the configuration is syntactically valid and restart NGINX

```bash
$ sudo service nginx reload; sudo service nginx restart
```

Request a certificate for your domain

```bash
$ cd /opt/letsencrypt
$ ./letsencrypt-auto --config /etc/letsencrypt/configs/<my-domain> certonly
```

Point nginx configuration to use the Let’s Encrypt certificates

```
server {
    listen 443 ssl;
    server_name <my-domain>;
    ssl_certificate /etc/letsencrypt/live/<my-domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<my-domain>/privkey.pem;

    [...]
 }
```

Restart nginx 

```bash
$ sudo service nginx restart
```

Let’s Encrypt certificates are only valid for 90 days, after which they need to be renewed. Create a monthly cron job script inside /etc/cron.monthly/renew_letsencrypt.sh and ensure it is executable.

```bash
#!/bin/sh
 
cd /opt/letsencrypt

# Refresh the certificates
for conf in $(ls /etc/letsencrypt/configs/*); do
  ./letsencrypt-auto certonly --config "$conf" --non-interactive
done
 
# make sure nginx picks them up
service nginx restart

```




