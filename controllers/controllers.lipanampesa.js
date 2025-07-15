import request from "request";
import 'dotenv/config'
import axios from "axios";

// @desc initiate stk push
// @method POST
// @route /stkPush
// @access public

function parseDate(val) {
    return (val < 10) ? "0" + val : val;
}

const getTimestamp = () => {

    const dateString = new Date().toLocaleString("en-us", { timeZone: "Africa/Nairobi" })
    const dateObject = new Date(dateString);
    const month = parseDate(dateObject.getMonth() + 1);
    const day = parseDate(dateObject.getDate());
    const hour = parseDate(dateObject.getHours());
    const minute = parseDate(dateObject.getMinutes());
    const second = parseDate(dateObject.getSeconds());
    return dateObject.getFullYear() + "" + month + "" + day + "" +
        hour + "" + minute + "" + second;
}

export const initiateSTKPush = async (req, res) => {
    try {
        const { amount, phone, Order_ID } = req.body;

        // choose environment url
        const url = process.env.ENVIRONMENT === 'production'
            ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
            : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

        const auth = "Bearer " + req.safaricom_access_token;
        const timestamp = getTimestamp();
        const password = Buffer.from(
            process.env.BUSINESS_SHORT_CODE + process.env.PASS_KEY + timestamp
        ).toString('base64');

        // callback url
        const callback_url = `${process.env.CALLBACK_BASE_URL}/api/stkPushCallback/${Order_ID}`;
        console.log(`📡 Initiating STK Push with callback: ${callback_url}`);

        const payload = {
            BusinessShortCode: process.env.BUSINESS_SHORT_CODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: process.env.BUSINESS_SHORT_CODE,
            PhoneNumber: phone,
            CallBackURL: callback_url,
            AccountReference: "venum",
            TransactionDesc: "Paid online"
        };

        const response = await axios.post(url, payload, {
            headers: { Authorization: auth }
        });

        res.status(200).json(response.data);

    } catch (error) {
        console.error("❌ Error while trying to create LipaNaMpesa details:", error.response?.data || error.message);
        res.status(503).send({
            message: "Something went wrong while trying to create LipaNaMpesa details. Contact admin.",
            error: error.response?.data || error.message
        });
    }
};



// @desc callback route Safaricom will post transaction status
// @method POST
// @route /stkPushCallback/:Order_ID
// @access public
export const stkPushCallback = async (req, res) => {
    try {
        console.log("📢 FULL CALLBACK RECEIVED:", JSON.stringify(req.body, null, 2));

        const { Order_ID } = req.params;
        const callbackData = req.body?.Body?.stkCallback;

        if (!callbackData) {
            console.error("❌ Invalid callback structure received");
            console.log("Received payload:", req.body);
            throw new Error("Invalid callback structure: stkCallback missing");
        }

        const {
            MerchantRequestID,
            CheckoutRequestID,
            ResultCode,
            ResultDesc,
            CallbackMetadata
        } = callbackData;

        // Extract metadata if available
        let paymentDetails = {};
        if (CallbackMetadata?.Item) {
            const meta = CallbackMetadata.Item;
            paymentDetails = {
                Amount: meta.find(o => o.Name === "Amount")?.Value,
                MpesaReceiptNumber: meta.find(o => o.Name === "MpesaReceiptNumber")?.Value,
                TransactionDate: meta.find(o => o.Name === "TransactionDate")?.Value,
                PhoneNumber: meta.find(o => o.Name === "PhoneNumber")?.Value
            };
        }

        // Log all details in a readable format
        console.log("\n" + "=".repeat(50));
        console.log("💰 MPESA STK CALLBACK RECEIVED");
        console.log("-".repeat(50));
        console.log(`🆔 Order ID: ${Order_ID}`);
        console.log(`📛 Merchant Request ID: ${MerchantRequestID}`);
        console.log(`🛒 Checkout Request ID: ${CheckoutRequestID}`);
        console.log(`🟢 Result Code: ${ResultCode}`);
        console.log(`📝 Result Description: ${ResultDesc}`);
        
        if (Object.keys(paymentDetails).length > 0) {
            console.log("\n💳 Payment Details:");
            console.log(`   💰 Amount: ${paymentDetails.Amount}`);
            console.log(`   📄 Receipt Number: ${paymentDetails.MpesaReceiptNumber}`);
            console.log(`   📱 Phone Number: ${paymentDetails.PhoneNumber}`);
            console.log(`   📅 Transaction Date: ${paymentDetails.TransactionDate}`);
        }
        console.log("=".repeat(50) + "\n");

        res.json({ success: true, received: true });

    } catch (e) {
        console.error("❌ Error processing callback:", e.message);
        res.status(400).json({
            success: false,
            error: e.message,
            receivedBody: req.body
        });
    }
};



// @desc Check from safaricom servers the status of a transaction
// @method GET
// @route /confirmPayment/:CheckoutRequestID
// @access public
export const confirmPayment = async (req, res) => {
    try {


        const url = "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query"
        const auth = "Bearer " + req.safaricom_access_token

        const timestamp = getTimestamp()
        //shortcode + passkey + timestamp
        const password = new Buffer.from(process.env.BUSINESS_SHORT_CODE + process.env.PASS_KEY + timestamp).toString('base64')


        request(
            {
                url: url,
                method: "POST",
                headers: {
                    "Authorization": auth
                },
                json: {
                    "BusinessShortCode": process.env.BUSINESS_SHORT_CODE,
                    "Password": password,
                    "Timestamp": timestamp,
                    "CheckoutRequestID": req.params.CheckoutRequestID,

                }
            },
            function (error, response, body) {
                if (error) {
                    console.log(error)
                    res.status(503).send({
                        message: "Something went wrong while trying to create LipaNaMpesa details. Contact admin",
                        error: error
                    })
                } else {
                    res.status(200).json(body)
                }
            }
        )
    } catch (e) {
        console.error("Error while trying to create LipaNaMpesa details", e)
        res.status(503).send({
            message: "Something went wrong while trying to create LipaNaMpesa details. Contact admin",
            error: e
        })
    }
}
