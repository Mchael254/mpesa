import ngrok from 'ngrok';

(async () => {
    try {
        const url = await ngrok.connect(3000);
        console.log("callback ", url);
    } catch (err) {
        console.error("NGROK ERROR", err);
    }
})();
