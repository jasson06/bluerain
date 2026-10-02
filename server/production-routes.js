// Operational endpoints retained from the live server.
module.exports = function createProductionRoutes(serverContext) {
function registerUploadListing() {
serverContext.app.get('/api/list-uploads', (req, res) => {
  const directoryPath = serverContext.uploadDir;

    serverContext.fs.readdir(directoryPath, (err, files) => {
        if (err) {
            return res.status(500).json({ message: "Unable to read upload directory.", error: err });
        }
        res.json({ uploadedFiles: files });
    });
});
}
function registerHealthCheck() {
serverContext.app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});
}
return { registerUploadListing, registerHealthCheck };
};
