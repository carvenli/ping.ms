#!/bin/bash

#vars
version="$1"
brach="stable"
arch=`uname -m`
target="unix"
stagingFolder="/tmp/ping.ms-bot-$version-$target-$arch"


#verify args
if [ -z $version ]; then
  echo "No version provided... exiting"
  exit
fi

echo "Creating staging location"
mkdir $stagingFolder
cd $stagingFolder

echo "Checking out latest version"
git clone https://github.com/eSited/ping.ms.git
cd $stagingFolder/ping.ms
git checkout $branch
cd $stagingFolder

echo "Removing version control"
rm -rf $stagingFolder/ping.ms/.git
rm -f $stagingFolder/ping.ms/.gitignore

echo "Removing non bot releated code"
rm -f $stagingFolder/ping.ms/ping.ms-bot-build.sh
rm -f $stagingFolder/ping.ms/.gjslintrc
rm -f $stagingFolder/ping.ms/.jshintignore
rm -f $stagingFolder/ping.ms/.jshintrc
rm -rf $stagingFolder/ping.ms/admin
rm -rf $stagingFolder/ping.ms/bin
rm -rf $stagingFolder/ping.ms/main
rm -rf $stagingFolder/ping.ms/models

echo "Replacing package.json"
rm $stagingFolder/ping.ms/package.json
mv $stagingFolder/ping.ms/package.bot.json $stagingFolder/ping.ms/package.json

echo "Creating tarball"
tar -czf $stagingFolder.tar.gz -C $stagingFolder *

echo "Removing temp folder"
rm -rf $stagingFolder

echo "Build complete: $stagingFolder.tar.gz"
