// Scripts the bash course's units 9-10 rely on, run in the simulated shell and compared with what real bash
// (5.3.20(1)-release, LC_ALL=C, stdin piped) printed for the same files, script and command line. The expectations were
// captured from real bash, not written by hand; the command runs from the folder holding the files, stdin is piped
// (tty: false, so `read -p` shows no prompt, as in bash). Two known differences are left out on purpose: bash
// 5.3's newer "[: abc: integer expected" wording (the sandbox keeps 5.2's "integer expression expected", which most
// learners' machines print), and `bash -c`'s "line 1:" prefix. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Shell } from '../js/shell.js';

const CASES = [
 {
  "name": "args",
  "files": {
   "s.sh": "#!/bin/bash\necho \"name: $0\"\necho \"count: $#\"\necho \"first: $1\"\nfor a in \"$@\"; do echo \"[$a]\"; done\nfor a in $@; do echo \"<$a>\"; done\necho \"all: $*\"\n"
  },
  "cmd": "bash s.sh 'one' 'two words' 'three'",
  "out": "name: s.sh\ncount: 3\nfirst: one\n[one]\n[two words]\n[three]\n<one>\n<two>\n<words>\n<three>\nall: one two words three\n",
  "err": ""
 },
 {
  "name": "exit-codes",
  "files": {
   "s.sh": "false\necho \"after false: $?\"\ntrue\necho \"after true: $?\"\nls nope 2>/dev/null\necho \"ls: $?\"\nexit 3\necho never\n"
  },
  "cmd": "bash s.sh; echo \"[exit $?]\"",
  "out": "after false: 1\nafter true: 0\nls: 2\n[exit 3]\n",
  "err": ""
 },
 {
  "name": "set-e",
  "files": {
   "s.sh": "set -e\necho start\nfalse\necho never\n"
  },
  "cmd": "bash s.sh; echo \"[exit $?]\"",
  "out": "start\n[exit 1]\n",
  "err": ""
 },
 {
  "name": "set-e-if",
  "files": {
   "s.sh": "set -e\nif false; then echo no; fi\nfalse || echo recovered\necho end\n"
  },
  "cmd": "bash s.sh",
  "out": "recovered\nend\n",
  "err": ""
 },
 {
  "name": "xtrace",
  "files": {
   "s.sh": "x=5\necho \"x is $x\"\nfor i in 1 2; do echo $i; done\n"
  },
  "cmd": "{ bash -x s.sh ; } 2>&1",
  "out": "+ x=5\n+ echo 'x is 5'\nx is 5\n+ for i in 1 2\n+ echo 1\n1\n+ for i in 1 2\n+ echo 2\n2\n"
 },
 {
  "name": "xtrace-set",
  "files": {
   "s.sh": "set -x\nname=\"a b\"\necho \"$name\" done\nset +x\necho quiet\n"
  },
  "cmd": "{ bash s.sh ; } 2>&1",
  "out": "+ name='a b'\n+ echo 'a b' done\na b done\n+ set +x\nquiet\n"
 },
 {
  "name": "if-elif",
  "files": {
   "s.sh": "n=$1\nif [ \"$n\" -gt 10 ]; then\n  echo big\nelif [ \"$n\" -eq 10 ]; then\n  echo ten\nelse\n  echo small\nfi\n"
  },
  "cmd": "bash s.sh '10'",
  "out": "ten\n",
  "err": ""
 },
 {
  "name": "if-elif-big",
  "files": {
   "s.sh": "n=$1\nif [ \"$n\" -gt 10 ]; then\n  echo big\nelif [ \"$n\" -eq 10 ]; then\n  echo ten\nelse\n  echo small\nfi\n"
  },
  "cmd": "bash s.sh '42'",
  "out": "big\n",
  "err": ""
 },
 {
  "name": "tests",
  "files": {
   "a.txt": "hi\n",
   "empty.txt": "",
   "d/x": "y\n",
   "s.sh": "for f in a.txt empty.txt d nope; do\n  [ -e \"$f\" ] && echo \"$f exists\"\n  [ -f \"$f\" ] && echo \"$f is a file\"\n  [ -d \"$f\" ] && echo \"$f is a dir\"\n  [ -s \"$f\" ] && echo \"$f not empty\"\n  [ ! -e \"$f\" ] && echo \"$f missing\"\ndone\n[ -z \"\" ] && echo z\n[ -n \"x\" ] && echo n\n[ \"a\" = \"a\" ] && echo eq\n[ \"a\" != \"b\" ] && echo ne\n[ 3 -lt 5 ] && echo lt\n[ 3 -ge 3 ] && echo ge\ntest 2 -ne 3 && echo tne\n[ -r a.txt ] && [ -w a.txt ] && echo rw\n[ -x a.txt ] || echo notx\n"
  },
  "cmd": "bash s.sh",
  "out": "a.txt exists\na.txt is a file\na.txt not empty\nempty.txt exists\nempty.txt is a file\nd exists\nd is a dir\nd not empty\nnope missing\nz\nn\neq\nne\nlt\nge\ntne\nrw\nnotx\n",
  "err": ""
 },
 {
  "name": "missing-arg",
  "files": {
   "s.sh": "if [ $# -eq 0 ]; then\n  echo \"usage: $0 file\" >&2\n  exit 1\nfi\necho ok\n"
  },
  "cmd": "bash s.sh; echo \"[exit $?]\"",
  "out": "[exit 1]\n",
  "err": "usage: s.sh file\n"
 },
 {
  "name": "loops",
  "files": {
   "notes.txt": "a\nb\n",
   "todo.txt": "c\n",
   "img.png": "",
   "s.sh": "for f in *.txt; do\n  echo \"file: $f\"\ndone\nfor i in 1 2 3; do echo -n \"$i \"; done\necho\nfor i in $(seq 1 3); do echo \"n$i\"; done\ni=0\nwhile [ $i -lt 3 ]; do\n  echo \"i=$i\"\n  i=$((i + 1))\ndone\nuntil [ $i -eq 0 ]; do i=$((i-1)); done; echo \"i=$i\"\nfor n in {1..3}; do echo \"b$n\"; done\n"
  },
  "cmd": "bash s.sh",
  "out": "file: notes.txt\nfile: todo.txt\n1 2 3 \nn1\nn2\nn3\ni=0\ni=1\ni=2\ni=0\nb1\nb2\nb3\n",
  "err": ""
 },
 {
  "name": "read-loop",
  "files": {
   "names.txt": "ann\nbob smith\ncy\n",
   "s.sh": "while read -r line; do\n  echo \"hello $line\"\ndone < names.txt\nwhile read -r first rest; do echo \"$first|$rest\"; done < names.txt\ncount=0\nwhile IFS= read -r l; do count=$((count+1)); done < names.txt\necho \"$count lines\"\ncat names.txt | while read -r n; do echo \"piped $n\"; done\nwhile IFS=: read -r u x; do echo \"$u\"; done < /etc/passwd | head -1\n"
  },
  "cmd": "bash s.sh",
  "out": "hello ann\nhello bob smith\nhello cy\nann|\nbob|smith\ncy|\n3 lines\npiped ann\npiped bob smith\npiped cy\nroot\n",
  "err": ""
 },
 {
  "name": "read-stdin",
  "files": {
   "s.sh": "read -r name\necho \"Hi, $name!\"\nread -r a b\necho \"a=$a b=$b\"\nwhile read -r x; do echo \"rest: $x\"; done\n"
  },
  "cmd": "bash s.sh",
  "stdin": "Ada\none two three\nx\ny\n",
  "out": "Hi, Ada!\na=one b=two three\nrest: x\nrest: y\n",
  "err": ""
 },
 {
  "name": "read-p",
  "files": {
   "s.sh": "read -p \"Name? \" name\necho \"Hi $name\"\n"
  },
  "cmd": "{ bash s.sh ; } 2>&1",
  "stdin": "Bo\n",
  "out": "Hi Bo\n"
 },
 {
  "name": "functions",
  "files": {
   "s.sh": "greet() {\n  local who=$1\n  echo \"hello $who\"\n  return 2\n}\nwho=outer\ngreet world\necho \"status $?\"\necho \"who=$who\"\nfunction add {\n  echo $(( $1 + $2 ))\n}\nsum=$(add 2 3)\necho \"sum=$sum\"\nis_even() { [ $(( $1 % 2 )) -eq 0 ]; }\nif is_even 4; then echo \"4 even\"; fi\nis_even 3 || echo \"3 odd\"\necho \"$0 still\"\n"
  },
  "cmd": "bash s.sh",
  "out": "hello world\nstatus 2\nwho=outer\nsum=5\n4 even\n3 odd\ns.sh still\n",
  "err": ""
 },
 {
  "name": "param-exp",
  "files": {
   "s.sh": "f=report.final.txt\necho \"${f%.txt}\"\necho \"${f%%.*}\"\necho \"${f#*.}\"\necho \"${f##*.}\"\necho \"${#f}\"\necho \"${f/txt/md}\"\necho \"${unset:-default}\"\nx=\necho \"[${x:-empty}]\"\np=/home/you/docs/a.txt\necho \"${p##*/}\"\necho \"${p%/*}\"\nfor g in a.txt b.txt; do echo \"mv $g ${g%.txt}.bak\"; done\necho \"${f^^}\" \n"
  },
  "cmd": "bash s.sh",
  "out": "report.final\nreport\nfinal.txt\ntxt\n16\nreport.final.md\ndefault\n[empty]\na.txt\n/home/you/docs\nmv a.txt a.bak\nmv b.txt b.bak\nREPORT.FINAL.TXT\n",
  "err": ""
 },
 {
  "name": "heredoc",
  "files": {
   "s.sh": "name=World\ncat <<EOF\nHello $name\n  indented\nEOF\ncat <<'EOF'\nno $name expansion\nEOF\ncat <<-EOF\n\tTabbed $name\n\tEOF\ncat > out.txt <<EOF\nline1\nline2\nEOF\nwc -l < out.txt\nwhile read -r l; do echo \"<$l>\"; done <<EOF\nx y\nz\nEOF\n"
  },
  "cmd": "bash s.sh",
  "out": "Hello World\n  indented\nno $name expansion\nTabbed World\n2\n<x y>\n<z>\n",
  "err": ""
 },
 {
  "name": "subst-arith",
  "files": {
   "s.sh": "n=$(echo hello | wc -c)\necho \"n=$n\"\necho $((3*4+2))\necho $(( 10 / 3 )) $(( 10 % 3 ))\nx=7; x=$((x*2)); echo $x\ntoday=$(date +%Y)\n[ -n \"$today\" ] && echo has-year\necho \"`echo back`\"\n"
  },
  "cmd": "bash s.sh",
  "out": "n=6\n14\n3 1\n14\nhas-year\nback\n",
  "err": ""
 },
 {
  "name": "backup",
  "files": {
   "docs/a.txt": "A\n",
   "docs/b.txt": "B\n",
   "docs/c.md": "C\n",
   "s.sh": "#!/bin/bash\n# back up txt files\nsrc=${1:-docs}\ndest=backup\nmkdir -p \"$dest\"\ncount=0\nfor f in \"$src\"/*.txt; do\n  cp \"$f\" \"$dest/\"\n  count=$((count + 1))\ndone\necho \"Backed up $count files to $dest\"\n"
  },
  "cmd": "bash s.sh; echo \"[exit $?]\"; ls -1 backup",
  "out": "Backed up 2 files to backup\n[exit 0]\na.txt\nb.txt\n",
  "err": ""
 },
 {
  "name": "rename-ext",
  "files": {
   "p/a.txt": "",
   "p/b.txt": "",
   "p/keep.md": "",
   "s.sh": "cd p\nfor f in *.txt; do\n  mv \"$f\" \"${f%.txt}.md\"\ndone\nls -1\n"
  },
  "cmd": "bash s.sh",
  "out": "a.md\nb.md\nkeep.md\n",
  "err": ""
 },
 {
  "name": "break-continue",
  "files": {
   "s.sh": "for x in 1 2 3 4 5 6; do\n  if [ $x -eq 2 ]; then continue; fi\n  if [ $x -eq 5 ]; then break; fi\n  echo $x\ndone\n"
  },
  "cmd": "bash s.sh",
  "out": "1\n3\n4\n",
  "err": ""
 },
 {
  "name": "and-or-not",
  "files": {
   "s.sh": "[ -f nope ] || echo \"no file\"\n! false && echo negated\ntrue && false || echo fallback\nmkdir -p d && cd d && pwd | sed \"s#.*/##\"\n"
  },
  "cmd": "bash s.sh",
  "out": "no file\nnegated\nfallback\nd\n",
  "err": ""
 },
 {
  "name": "quotes",
  "files": {
   "s.sh": "a=\"two  spaces\"\necho $a\necho \"$a\"\necho '$a'\necho \"it's \\\"quoted\\\" \\$HOME\"\nprintf \"%s-%s\\n\" x y z\nprintf \"%5s|%-5s|%03d\\n\" ab cd 7\n"
  },
  "cmd": "bash s.sh",
  "out": "two spaces\ntwo  spaces\n$a\nit's \"quoted\" $HOME\nx-y\nz-\n   ab|cd   |007\n",
  "err": ""
 },
 {
  "name": "shift",
  "files": {
   "s.sh": "echo \"$# $1\"\nshift\necho \"$# $1\"\nshift 2\necho \"$# $@\"\n"
  },
  "cmd": "bash s.sh 'a' 'b' 'c' 'd'",
  "out": "4 a\n3 b\n1 d\n",
  "err": ""
 },
 {
  "name": "exit-in-func",
  "files": {
   "s.sh": "die() { echo \"error: $1\" >&2; exit 4; }\necho before\n[ -f nope ] || die \"missing file\"\necho after\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "before\nerror: missing file\n[exit 4]\n"
 },
 {
  "name": "grep-count",
  "files": {
   "log.txt": "ERROR a\nINFO b\nERROR c\nWARN d\n",
   "s.sh": "file=$1\nerrors=$(grep -c ERROR \"$file\")\necho \"$file: $errors errors\"\nif grep -q WARN \"$file\"; then echo \"has warnings\"; fi\ngrep ERROR \"$file\" | cut -d\" \" -f2 | sort -r\n"
  },
  "cmd": "bash s.sh 'log.txt'",
  "out": "log.txt: 2 errors\nhas warnings\nc\na\n",
  "err": ""
 },
 {
  "name": "syntax-error",
  "files": {
   "s.sh": "echo one\nif [ 1 -eq 1 ]\n  echo two\nfi\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "one\ns.sh: line 4: syntax error near unexpected token `fi'\ns.sh: line 4: `fi'\n[exit 2]\n"
 },
 {
  "name": "unbound-cmd",
  "files": {
   "s.sh": "echo a\nnosuchcmd\necho \"status $?\"\n"
  },
  "cmd": "{ bash s.sh ; } 2>&1",
  "out": "a\ns.sh: line 2: nosuchcmd: command not found\nstatus 127\n"
 },
 {
  "name": "test-err",
  "files": {
   "s.sh": "x=\"a b\"\n[ $x = \"a b\" ] && echo yes\necho \"st $?\"\n"
  },
  "cmd": "{ bash s.sh ; } 2>&1",
  "out": "s.sh: line 2: [: too many arguments\nst 2\n"
 },
 {
  "name": "nested-func-loop",
  "files": {
   "s.sh": "count_files() {\n  local dir=$1 n=0\n  for f in \"$dir\"/*; do\n    [ -f \"$f\" ] && n=$((n+1))\n  done\n  echo \"$n\"\n}\nmkdir -p a b\ntouch a/1 a/2 b/3\nfor d in a b; do echo \"$d: $(count_files $d)\"; done\n"
  },
  "cmd": "bash s.sh",
  "out": "a: 2\nb: 1\n",
  "err": ""
 },
 {
  "name": "exec-direct",
  "files": {
   "s.sh": "#!/bin/bash\necho \"I am $0 with $#\"\n"
  },
  "cmd": "chmod +x s.sh; ./s.sh 'x'",
  "out": "I am ./s.sh with 1\n",
  "err": ""
 },
 {
  "name": "dollar-q-pipe",
  "files": {
   "s.sh": "echo hi | grep -q hi\necho $?\necho hi | grep -q no\necho $?\n"
  },
  "cmd": "bash s.sh",
  "out": "0\n1\n",
  "err": ""
 },
 {
  "name": "env-var",
  "files": {
   "s.sh": "echo \"home=$HOME\"\necho \"${GREETING:-none}\"\necho \"${LOCALV:-unset}\"\n"
  },
  "cmd": "export GREETING=hey; LOCALV=x; bash s.sh",
  "out": "home=/home/you\nhey\nunset\n",
  "err": ""
 },
 {
  "name": "set-u",
  "files": {
   "s.sh": "set -u\necho \"a\"\necho \"$nope\"\necho \"b\"\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "a\ns.sh: line 3: nope: unbound variable\n[exit 1]\n"
 },
 {
  "name": "read-no-final-nl",
  "files": {
   "s.sh": "while read -r a; do echo \"got:$a\"; done\necho \"left:$a\"\n"
  },
  "cmd": "bash s.sh",
  "stdin": "one\nlast-no-newline",
  "out": "got:one\nleft:last-no-newline\n",
  "err": ""
 },
 {
  "name": "string-cmp",
  "files": {
   "s.sh": "ans=$1\nif [ \"$ans\" = \"yes\" ] || [ \"$ans\" = \"y\" ]; then echo ok; else echo no; fi\nif [ -z \"$2\" ]; then echo \"no second\"; fi\n[ \"$ans\" \\< \"z\" ] && echo less\n"
  },
  "cmd": "bash s.sh 'y'",
  "out": "ok\nno second\nless\n",
  "err": ""
 },
 {
  "name": "count-lines-files",
  "files": {
   "logs/a.log": "1\n2\n",
   "logs/b.log": "1\n2\n3\n",
   "s.sh": "total=0\nfor f in logs/*.log; do\n  n=$(wc -l < \"$f\")\n  echo \"$f $n\"\n  total=$((total + n))\ndone\necho \"total $total\"\n"
  },
  "cmd": "bash s.sh",
  "out": "logs/a.log 2\nlogs/b.log 3\ntotal 5\n",
  "err": ""
 },
 {
  "name": "tee-append",
  "files": {
   "s.sh": "for i in 1 2 3; do echo \"line $i\" >> out.log; done\ncat out.log | tee copy.log | wc -l\ncat copy.log\n"
  },
  "cmd": "bash s.sh",
  "out": "3\nline 1\nline 2\nline 3\n",
  "err": ""
 },
 {
  "name": "braces-group",
  "files": {
   "s.sh": "{ echo a; echo b; } > g.txt\ncat g.txt\n( cd /tmp; pwd )\n"
  },
  "cmd": "bash s.sh",
  "out": "a\nb\n/tmp\n",
  "err": ""
 },
 {
  "name": "arith-cmp",
  "files": {
   "s.sh": "a=3\nb=10\nif [ $a -lt $b ]; then echo \"$a < $b\"; fi\nmax=$(( a > b ? a : b ))\necho $max\necho $(( (a + b) * 2 ))\n"
  },
  "cmd": "bash s.sh",
  "out": "3 < 10\n10\n26\n",
  "err": ""
 },
 {
  "name": "exit-status-script",
  "files": {
   "hay.txt": "no\n",
   "s.sh": "grep -q needle hay.txt\n"
  },
  "cmd": "bash s.sh; echo \"[exit $?]\"",
  "out": "[exit 1]\n",
  "err": ""
 },
 {
  "name": "set-e-pipe-and",
  "files": {
   "s.sh": "set -e\nfalse && echo x\necho \"still here\"\ncd nope\necho never\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "still here\ns.sh: line 4: cd: nope: No such file or directory\n[exit 1]\n"
 },
 {
  "name": "dollar-hash-zero",
  "files": {
   "s.sh": "echo \"$#\"\necho \"[$1]\"\necho \"[$@]\"\n"
  },
  "cmd": "bash s.sh",
  "out": "0\n[]\n[]\n",
  "err": ""
 },
 {
  "name": "source-vs-bash",
  "files": {
   "s.sh": "v=inner\ncd /tmp\n"
  },
  "cmd": "v=outer; bash s.sh; echo \"[exit $?]\"; echo \"v=$v\"",
  "out": "[exit 0]\nv=outer\n",
  "err": ""
 },
 {
  "name": "redirect-stderr-in-script",
  "files": {
   "s.sh": "echo out\necho err >&2\nls nope 2> errs.txt\ncat errs.txt\n"
  },
  "cmd": "bash s.sh",
  "out": "out\nls: cannot access 'nope': No such file or directory\n",
  "err": "err\n"
 },
 {
  "name": "multi-line-cmd",
  "files": {
   "a": "",
   "b": "",
   "s.sh": "echo one \\\n  two \\\n  three\nif true &&\n   true; then echo yes; fi\nls -1 |\n  wc -l\n"
  },
  "cmd": "bash s.sh",
  "out": "one two three\nyes\n3\n",
  "err": ""
 },
 {
  "name": "comments",
  "files": {
   "s.sh": "#!/bin/bash\n# a comment\necho hi # trailing\necho \"# not a comment\"\necho a#b\n"
  },
  "cmd": "bash s.sh",
  "out": "hi\n# not a comment\na#b\n",
  "err": ""
 },
 {
  "name": "local-default",
  "files": {
   "s.sh": "f() { local x; x=${1:-none}; echo \"$x\"; }\nf\nf given\necho \"[$x]\"\n"
  },
  "cmd": "bash s.sh",
  "out": "none\ngiven\n[]\n",
  "err": ""
 },
 {
  "name": "return-noarg",
  "files": {
   "s.sh": "f() { false; return; }\nf; echo \"rc=$?\"\ng() { echo in; }\ng; echo \"rc=$?\"\n"
  },
  "cmd": "bash s.sh",
  "out": "rc=1\nin\nrc=0\n",
  "err": ""
 },
 {
  "name": "space-errs",
  "files": {
   "s.sh": "x=3\n[-f a]\necho \"st $?\"\n[ $x -eq 3]\necho \"st $?\"\nx = 5\necho \"st $?\"\nif [ $x == 3 ]; then echo dbl; fi\n"
  },
  "cmd": "{ bash s.sh ; } 2>&1",
  "out": "s.sh: line 2: [-f: command not found\nst 127\ns.sh: line 4: [: missing `]'\nst 2\ns.sh: line 6: x: command not found\nst 127\ndbl\n"
 },
 {
  "name": "eof-if",
  "files": {
   "s.sh": "echo a\nif true; then\n  echo b\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "a\ns.sh: line 4: syntax error: unexpected end of file from `if' command on line 2\n[exit 2]\n"
 },
 {
  "name": "eof-for",
  "files": {
   "s.sh": "echo a\nfor i in 1 2; do\n  echo $i\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "a\ns.sh: line 4: syntax error: unexpected end of file from `for' command on line 2\n[exit 2]\n"
 },
 {
  "name": "missing-then",
  "files": {
   "s.sh": "echo a\nif [ 1 = 1 ]\n  echo b\nelse\n  echo c\nfi\necho z\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "a\ns.sh: line 4: syntax error near unexpected token `else'\ns.sh: line 4: `else'\n[exit 2]\n"
 },
 {
  "name": "missing-do",
  "files": {
   "s.sh": "for i in 1 2\n  echo $i\ndone\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "s.sh: line 2: syntax error near unexpected token `echo'\ns.sh: line 2: `  echo $i'\n[exit 2]\n"
 },
 {
  "name": "unclosed-quote",
  "files": {
   "s.sh": "echo a\necho \"oops\necho b\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "a\ns.sh: line 2: unexpected EOF while looking for matching `\"'\n[exit 2]\n"
 },
 {
  "name": "continue-n",
  "files": {
   "s.sh": "for i in 1 2; do for j in a b; do [ $j = b ] && continue 2; echo $i$j; done; echo never; done\n"
  },
  "cmd": "bash s.sh",
  "out": "1a\n2a\n",
  "err": ""
 },
 {
  "name": "env-shebang",
  "files": {
   "s.sh": "#!/usr/bin/env bash\necho env-ok \"$1\"\n"
  },
  "cmd": "chmod +x s.sh; ./s.sh 'q'",
  "out": "env-ok q\n",
  "err": ""
 },
 {
  "name": "bad-interp",
  "files": {
   "s.sh": "#!/bin/bsh\necho x\n"
  },
  "cmd": "{ chmod +x s.sh; ./s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "bash: ./s.sh: /bin/bsh: bad interpreter: No such file or directory\n[exit 126]\n"
 },
 {
  "name": "set-dashdash",
  "files": {
   "s.sh": "set -- x y z\necho \"$# $2\"\n"
  },
  "cmd": "bash s.sh",
  "out": "3 y\n",
  "err": ""
 },
 {
  "name": "command-v",
  "files": {
   "s.sh": "command -v ls\ncommand -v nope || echo \"no nope\"\ntype -t cd\n"
  },
  "cmd": "bash s.sh",
  "out": "/usr/bin/ls\nno nope\nbuiltin\n",
  "err": ""
 },
 {
  "name": "bash-c",
  "files": {
   "s.sh": "bash -c 'echo \"in $0 $1\"' zero one\n"
  },
  "cmd": "bash s.sh",
  "out": "in zero one\n",
  "err": ""
 },
 {
  "name": "xtrace-if",
  "files": {
   "s.sh": "n=2\nif [ $n -gt 1 ]; then echo big; fi\nwhile [ $n -gt 0 ]; do n=$((n-1)); done\nf() { echo \"f $1\"; }\nf a\nout=$(echo sub)\ncat > x.txt <<EOF\nhi\nEOF\n"
  },
  "cmd": "{ bash -x s.sh ; } 2>&1",
  "out": "+ n=2\n+ '[' 2 -gt 1 ']'\n+ echo big\nbig\n+ '[' 2 -gt 0 ']'\n+ n=1\n+ '[' 1 -gt 0 ']'\n+ n=0\n+ '[' 0 -gt 0 ']'\n+ f a\n+ echo 'f a'\nf a\n++ echo sub\n+ out=sub\n+ cat\n"
 },
 {
  "name": "exit-from-subst",
  "files": {
   "s.sh": "v=$(exit 3)\necho \"st $?\"\nx=$(false); echo \"x st $?\"\n"
  },
  "cmd": "bash s.sh",
  "out": "st 3\nx st 1\n",
  "err": ""
 },
 {
  "name": "read-from-file-arg",
  "files": {
   "list.txt": "a.txt\nb.txt\n",
   "s.sh": "file=$1\nwhile read -r name; do\n  touch \"$name\"\ndone < \"$file\"\nls -1 *.txt | sort\n"
  },
  "cmd": "bash s.sh 'list.txt'",
  "out": "a.txt\nb.txt\nlist.txt\n",
  "err": ""
 },
 {
  "name": "echo-e",
  "files": {
   "s.sh": "echo -e \"a\\tb\\nc\"\necho -n x; echo y\n"
  },
  "cmd": "bash s.sh",
  "out": "a\tb\nc\nxy\n",
  "err": ""
 },
 {
  "name": "nested-if",
  "files": {
   "s.sh": "for f in a b; do\n  if [ $f = a ]; then\n    if true; then echo \"inner $f\"; fi\n  else\n    echo \"else $f\"\n  fi\ndone\n"
  },
  "cmd": "bash s.sh",
  "out": "inner a\nelse b\n",
  "err": ""
 },
 {
  "name": "exit-code-last",
  "files": {
   "s.sh": "echo hi\nfalse\n"
  },
  "cmd": "bash s.sh; echo \"[exit $?]\"",
  "out": "hi\n[exit 1]\n",
  "err": ""
 },
 {
  "name": "set-e-func",
  "files": {
   "s.sh": "set -e\nf() { echo in; false; echo after-false; }\nf\necho end\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "in\n[exit 1]\n"
 },
 {
  "name": "dollar-dollar",
  "files": {
   "s.sh": "[ -n \"$$\" ] && echo has-pid\n"
  },
  "cmd": "bash s.sh",
  "out": "has-pid\n",
  "err": ""
 },
 {
  "name": "nested-eof",
  "files": {
   "s.sh": "echo a\nif true; then\n  for i in 1; do\n    echo $i\n"
  },
  "cmd": "{ bash s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "a\ns.sh: line 5: syntax error: unexpected end of file from `for' command on line 3\n[exit 2]\n"
 },
 {
  "name": "read-ifs-keep",
  "files": {
   "s.sh": "IFS= read -r l; echo \"[$l]\"; read -r m; echo \"[$m]\"\n"
  },
  "cmd": "bash s.sh",
  "stdin": "  two  spaces  \n  x  \n",
  "out": "[  two  spaces  ]\n[x]\n",
  "err": ""
 },
 {
  "name": "crlf",
  "files": {
   "s.sh": "#!/bin/bash\r\necho hi\r\n"
  },
  "cmd": "{ chmod +x s.sh; ./s.sh; echo \"[exit $?]\" ; } 2>&1",
  "out": "bash: ./s.sh: /bin/bash^M: bad interpreter: No such file or directory\n[exit 126]\n"
 }
];

for (const c of CASES) {
  test(`script vs real bash: ${c.name}`, () => {
    const sh = new Shell();
    sh.setupFiles(c.files);
    sh.setupDone();
    sh.run(c.cmd, { stdin: c.stdin ?? '', tty: false });
    assert.equal(sh.lastOut, c.out, 'stdout');
    if ('err' in c) assert.equal(sh.lastErr, c.err, 'stderr');
  });
}
