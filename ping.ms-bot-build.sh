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

echo "Removing non bot releated code"
rm -f $stagingFolder/ping.ms/ping.ms-release.sh
rm -rf $stagingFolder/ping.ms/admin
rm -rf $stagingFolder/ping.ms/bin
rm -rf $stagingFolder/ping.ms/main
rm -rf $stagingFolder/ping.ms/models

echo "Copying in node bin"
mkdir bin
cp `which node` bin

echo "Executing NPM install"
cd $stagingFolder/ping.ms
npm install > /dev/null
cd $stagingFolder

echo "Creating tarball"
tar -czf $stagingFolder.tar.gz -C $stagingFolder *

echo "Removing temp folder"
rm -rf $stagingFolder

echo "Build complete: $stagingFolder.tar.gz"
