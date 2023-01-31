#!/usr/bin/env bash
case "$1" in
    -d|--daemon)
        $0 </dev/null &> ./openbook-cranker.log & disown
        exit 0
        ;;
    *)
        ;;
esac

npx ts-node src/scripts/crank.ts