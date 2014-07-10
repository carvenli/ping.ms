#!/bin/bash

#vars
version="$1"
destination="$2"
brach="stable"
arch=`uname -m`
target="unix"
file="ping.ms-bot-$version-$target-$arch.tar.gz"
linkToLatest=0
stagingFolder="/tmp/ping.ms-bot-$version-$target-$arch"


#verify args
if [ -z $version ]; then
  echo "No version provided... exiting"
  exit
fi

if [ -z $destination ]; then
  if [ -d "/opt/ping.ms/main/public/downloads" ]; then
    linkToLatest=1
    destination="/opt/ping.ms/main/public/downloads"
    latestDestination="$(dirname $destination)/ping.ms-bot-latest-$target-$arch.tar.gz"
  else
    destination="$stagingFolder/$file"
  fi
fi

if [ -d $destination ]; then
  destination="$destination/$file"
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
rm -f $stagingFolder/ping.ms/.gjslintrc
rm -f $stagingFolder/ping.ms/.jshintignore
rm -f $stagingFolder/ping.ms/.jshintrc
rm -rf $stagingFolder/ping.ms/admin
rm -rf $stagingFolder/ping.ms/bin
rm -rf $stagingFolder/ping.ms/main
rm -rf $stagingFolder/ping.ms/models
rm -rf $stagingFolder/ping.ms/scripts

echo "Replacing package.json"
rm $stagingFolder/ping.ms/package.json
mv $stagingFolder/ping.ms/package.bot.json $stagingFolder/ping.ms/package.json

echo "Creating tarball"
tar -czf $stagingFolder/$file -C $stagingFolder *

echo "Writing to destination"
cp $stagingFolder/$file $destination

if [ $linkToLatest -eq 1 ]; then
  echo "Linking to latest version"
  rm -f $latestDestination
  ln -s $destination $latestDestination
fi

echo "Removing temp folder"
rm -rf $stagingFolder

echo "Build complete: $destination"
