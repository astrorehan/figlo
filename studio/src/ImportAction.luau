--!strict
-- A failed import cancels the recorded place edits. Uploaded assets remain on Roblox.
local ImportAction = {}
function ImportAction.run(history: any, import: () -> (any, any)): (any, any)
	local recording = history:TryBeginRecording("Figlo import")
	assert(recording, "Cannot start Undo recording; finish other Studio operations first")
	local ok, result, warnings = pcall(import)
	local operation = if ok then Enum.FinishRecordingOperation.Commit else Enum.FinishRecordingOperation.Cancel
	local finished, finishError = pcall(history.FinishRecording, history, recording, operation)
	if not finished then error("Could not finish Undo recording: " .. tostring(finishError)) end
	if not ok then error(result) end
	return result, warnings
end
return ImportAction
