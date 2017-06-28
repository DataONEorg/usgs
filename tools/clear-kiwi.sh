#!/bin/bash

psql -d kiwi -c "truncate table nodes cascade";
psql -d kiwi -c "truncate table triples cascade;"
