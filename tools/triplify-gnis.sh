#!/bin/bash

# triplify gnis input files
function gnis {
	node --max-old-space-size=8192 ./lib/gnis/$1.js
}

pushd ../
	gnis units
	gnis features
	gnis names
	gnis history
popd