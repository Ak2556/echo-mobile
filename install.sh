#!/bin/bash
while kill -0 $(cat /Users/aena/.gemini/antigravity-cli/brain/a4455f80-bf38-4773-b6da-49d4d4dbe8c6/.system_generated/tasks/task-3194.pid 2>/dev/null) 2>/dev/null; do
  sleep 5
done
APP_PATH=$(find /Users/aena/Library/Developer/Xcode/DerivedData/echo-* -name "echo.app" -type d | head -n 1)
xcrun simctl install 6B265626-0AAD-450E-8579-13AB4383A874 "$APP_PATH"
xcrun simctl launch 6B265626-0AAD-450E-8579-13AB4383A874 com.ak2556.echo
