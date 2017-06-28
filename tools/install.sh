#!/bin/bash
sudo echo "thanks for sudo"

pushd ../
	# install special geometry/GeoSPARQL branch of Apache Marmotta
	git clone -b geometry https://github.com/blake-regalia/marmotta.git ./ext/marmotta
	cd ./ext/marmotta
	mvn clean install -DskipTests=true

	# ensure nodejs v6 is installed
	curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
	sudo apt-get install -y nodejs
	sudo apt-get install -y build-essential

	# install node.js script dependencies
	npm install --production
popd
