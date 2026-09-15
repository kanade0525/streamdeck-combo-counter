#!/bin/sh
# 入力を数えるヘルパ（Swift）をプラグインの中に組み立てる。
# Xcode Command Line Tools があれば動く（無料）。
set -e
cd "$(dirname "$0")/.."
OUT=com.kanade0525.combocounter.sdPlugin/bin/tap-counter
swiftc -O -o "$OUT" src/tap-counter.swift
chmod 755 "$OUT"
echo "組み立てた: $OUT"
