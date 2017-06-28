#!/bin/bash
pushd ../
	home=${1:-marmotta-home}
	wd=`pwd -P`
	export JAVA_OPTS="-Xmx8192m"
	pushd ./ext/marmotta/launchers/marmotta-webapp/
		mvn tomcat7:run -Dmarmotta.home="$wd/ext/$home"
	popd
popd
