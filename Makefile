PID := .vite.pid
LOG := .vite.log

.PHONY: run stop

# Start the dev server in the background, on the LAN (see the Network URL).
run:
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		echo "Already running (pid $$(cat $(PID))). Log: $(LOG)"; \
	else \
		[ -d node_modules ] || npm install; \
		nohup node_modules/.bin/vite --host > $(LOG) 2>&1 & echo $$! > $(PID); \
		sleep 2; cat $(LOG); \
	fi

# Stop the dev server started by `make run`.
stop:
	@if [ -f $(PID) ] && kill $$(cat $(PID)) 2>/dev/null; then \
		echo "Stopped."; \
	else \
		echo "Not running."; \
	fi; \
	rm -f $(PID)
