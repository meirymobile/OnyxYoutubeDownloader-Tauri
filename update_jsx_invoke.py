import re

with open("src/DjayCompanion.jsx", "r") as f:
    code = f.read()

if 'import { invoke }' not in code:
    code = code.replace("import React, { useState, useEffect } from 'react';", "import React, { useState, useEffect } from 'react';\nimport { invoke } from '@tauri-apps/api/core';")
    with open("src/DjayCompanion.jsx", "w") as f:
        f.write(code)
    print("jsx invoke added")
else:
    print("Already added")
