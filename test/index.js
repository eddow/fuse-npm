var {fused} = require('../dist/fuse-npm');

fused('vue@^1.0.0').then(fn => console.log(fn));