help:
	@echo "pack 	package the app"

pack:
	rm -f task-view.zip
	# copy the app into a new directory
	cp -r ./task-view TCS_-_Task_View
	# zip the app (do it recursively (-r) and ignore any hidden mac files like '_MACOSX' and '.DS_STORE' (-X))
	zip -r -X task-view.zip TCS_-_Task_View
	# remove any existing files from a previous package
	rm -rf TCS_-_Task_View
	@echo "App has been packaged here: task-view.zip"
