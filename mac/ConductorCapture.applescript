-- Conductor Capture — the Spotlight front door for quick task capture.
--
-- ⌘Space → "conductor" → Enter → type the task → Enter. The helper is launched
-- detached so this dialog closes instantly; the confirmation alert arrives when
-- the task lands (the MLX refine can take a while on a cold server).
--
-- __HELPER_PATH__ is substituted with an absolute path by build-capture-app.sh,
-- so the compiled bundle doesn't assume where the repo lives.

on run
	set helperPath to "__HELPER_PATH__"

	try
		set response to display dialog "What do you need to do?" default answer "" with title "Conductor" with icon note buttons {"Cancel", "Add"} default button "Add"
	on error number -128
		return -- cancelled, say nothing
	end try

	set theText to text returned of response
	if theText is "" then return

	do shell script quoted form of helperPath & " " & quoted form of theText & " > /dev/null 2>&1 &"
end run
