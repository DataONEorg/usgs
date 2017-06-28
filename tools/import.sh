#!/bin/bash

function import {
	files=()
	for dir in "$@"; do
		files+=(./data/output/$dir/*.ttl)
	done

	node ./lib/marmotta/import.js "${files[@]}"
}

pushd ../
	import gnis geodatabases/*
popd
