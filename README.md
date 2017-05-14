# fuse-npm

Allows your JS application to download, bundle and require and/or serve NPM packages to the browser dynamically by name and version.

## Usage

```javascript
var {fused} = require('fuse-npm');

fused('vue@^1.0.0').then(fileName => console.log(fileName));
```

```typescript
import {fused} from 'fuse-npm';

var fileName = await fused('vue@^1.0.0');
```

The promise will resolve with the `fileName` of a .js file containing the npm module bundled with fuse-box.

The npm module is downloaded and bundled on-the-fly - every step is cached.

All the cache happens in `fuse_modules`.