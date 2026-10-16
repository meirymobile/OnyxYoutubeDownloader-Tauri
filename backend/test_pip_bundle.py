import pip
import runpy
print(pip.__version__)
try:
    import sys
    sys.argv = ["pip", "--version"]
    runpy.run_module("pip", run_name="__main__")
except Exception as e:
    print(f"Error: {e}")
