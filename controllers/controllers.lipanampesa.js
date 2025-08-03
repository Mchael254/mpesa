import request from "request";
import 'dotenv/config'
import axios from "axios";
import { createClient } from '@supabase/supabase-js';

// @desc initiate stk push
// @method POST
// @route /stkPush
// @access public
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
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
    const { amount, phone, Order_ID, memberId, payment_type_id } = req.body;

    // Validate required fields
    if (!amount || !phone || !Order_ID || !memberId || !payment_type_id) {
      return res.status(400).json({
        message: "Missing required fields: amount, phone, Order_ID, memberId, payment_type_id"
      });
    }

    // Store payment initiation with all necessary details
    const { error: paymentInitError } = await supabase
      .from('payment_initiations')
      .insert({
        order_id: Order_ID,
        member_id: memberId,
        payment_phone: phone,
        amount: amount,
        status: 'initiated',
        payment_type_id: payment_type_id,
      });

    if (paymentInitError) {
      console.error('❌ Error storing payment initiation:', paymentInitError);
      return res.status(500).json({
        message: "Failed to store payment initiation",
        error: paymentInitError
      });
    }

    console.log(`💾 Payment initiation stored: Order_ID=${Order_ID}, memberId=${memberId}, payment_type_id=${payment_type_id}`);

    // Choose environment URL
    const url = process.env.ENVIRONMENT === 'production'
      ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

    const auth = "Bearer " + req.safaricom_access_token;
    const timestamp = getTimestamp();
    const password = Buffer.from(
      process.env.BUSINESS_SHORT_CODE + process.env.PASS_KEY + timestamp
    ).toString('base64');

    // Callback URL
    const callback_url = `https://mpesa-dogr.onrender.com/api/stkPushCallback/${Order_ID}`;

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
const querySTKStatus = async (checkoutRequestID) => {
  const timestamp = getTimestamp();
  const password = Buffer.from(
    process.env.BUSINESS_SHORT_CODE + process.env.PASS_KEY + timestamp
  ).toString('base64');

  const token = await getSafaricomToken();

  const { data } = await axios.post(
    'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
    {
      BusinessShortCode: process.env.BUSINESS_SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestID,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return data;
};

// CALLBACK HANDLER
export const stkPushCallback = async (req, res) => {
  const io = req.app.get('io');
  try {
    console.log("📢 FULL CALLBACK RECEIVED:", JSON.stringify(req.body, null, 2));
    const { Order_ID } = req.params;
    const callbackData = req.body?.Body?.stkCallback;

    if (!callbackData) {
      throw new Error("Invalid callback structure: stkCallback missing");
    }

    // RETRIEVE memberId and payment_type_id from payment_initiations table
    const { data: paymentInit, error: retrieveError } = await supabase
      .from('payment_initiations')
      .select('member_id, amount, payment_type_id')
      .eq('order_id', Order_ID)
      .single();

    if (retrieveError || !paymentInit) {
      console.error('❌ Error retrieving payment initiation:', retrieveError);
      throw new Error('Payment initiation not found');
    }

    const memberId = paymentInit.member_id;
    const paymentTypeId = paymentInit.payment_type_id;
    console.log(`🔍 Retrieved memberId: ${memberId}, paymentTypeId: ${paymentTypeId} for Order_ID: ${Order_ID}`);

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata
    } = callbackData;

    let paymentDetails = {
      Amount: null,
      MpesaReceiptNumber: null,
      TransactionDate: null,
      PhoneNumber: null
    };

    if (CallbackMetadata?.Item) {
      const meta = CallbackMetadata.Item;
      paymentDetails = {
        Amount: meta.find(o => o.Name === "Amount")?.Value ?? null,
        MpesaReceiptNumber: meta.find(o => o.Name === "MpesaReceiptNumber")?.Value ?? null,
        TransactionDate: meta.find(o => o.Name === "TransactionDate")?.Value ?? null,
        PhoneNumber: meta.find(o => o.Name === "PhoneNumber")?.Value ?? null
      };
    }

    // Fallback if metadata missing
    if (ResultCode === 0 && !paymentDetails.MpesaReceiptNumber) {
      console.warn("⚠️ Callback metadata missing! Querying Safaricom for transaction status...");
      const query = await querySTKStatus(CheckoutRequestID);
      console.log("🔁 STK Query Response:", query);

      if (query.ResponseCode === "0" && query.ResultCode === "0") {
        paymentDetails = {
          Amount: paymentDetails.Amount ?? null,
          MpesaReceiptNumber: query.MpesaReceiptNumber ?? null,
          TransactionDate: paymentDetails.TransactionDate ?? null,
          PhoneNumber: paymentDetails.PhoneNumber ?? null,
        };
      } else {
        console.warn("❌ Failed to recover metadata. Safaricom query response not successful.");
      }
    }

    // Format transaction date
    let transactionDateISO = null;
    if (paymentDetails.TransactionDate && /^\d{14}$/.test(paymentDetails.TransactionDate.toString())) {
      const tdStr = paymentDetails.TransactionDate.toString();
      transactionDateISO = `${tdStr.slice(0, 4)}-${tdStr.slice(4, 6)}-${tdStr.slice(6, 8)}T${tdStr.slice(8, 10)}:${tdStr.slice(10, 12)}:${tdStr.slice(12, 14)}Z`;
    }

    // UPDATED: Insert to Supabase WITH memberId
    const { error } = await supabase.rpc('insert_mpesa_callback', {
      p_order_id: Order_ID,
      p_merchant_request_id: MerchantRequestID,
      p_checkout_request_id: CheckoutRequestID,
      p_result_code: ResultCode,
      p_result_desc: ResultDesc,
      p_amount: paymentDetails.Amount,
      p_mpesa_receipt_number: paymentDetails.MpesaReceiptNumber,
      p_transaction_date: transactionDateISO,
      p_phone_number: paymentDetails.PhoneNumber,
      p_member_id: memberId // PASS the memberId to the function
    });

    if (error) {
      console.error('❌ Supabase RPC insert error:', error);
      throw new Error('Failed to save callback data');
    }

    console.log(`✅ M-Pesa callback saved to database with memberId: ${memberId}`);

    // DYNAMIC PAYMENT TYPE HANDLING
    if (ResultCode === 0 && paymentDetails.Amount) {
      try {
        // Get payment type name for processing logic
        const { data: paymentType, error: paymentTypeError } = await supabase
          .from('payment_types')
          .select('name')
          .eq('id', paymentTypeId)
          .single();

        if (paymentTypeError) {
          console.error('❌ Error retrieving payment type:', paymentTypeError);
          throw new Error('Payment type not found');
        }

        const paymentTypeName = paymentType?.name?.toLowerCase();
        console.log(`🔄 Processing payment type: ${paymentTypeName}`);

        // Handle different payment types
        switch (paymentTypeName) {
          case 'registration':
            console.log('📝 Processing registration payment...');
            const { data: registrationResult, error: registrationError } = await supabase
              .rpc('process_registration_payment', {
                p_member_id: memberId,
                p_amount: paymentDetails.Amount,
                p_payment_reference: paymentDetails.MpesaReceiptNumber,
                p_order_id: Order_ID
              });

            if (registrationError) {
              console.error('❌ Error processing registration payment:', registrationError);
            } else {
              console.log('✅ Registration payment processed successfully:', registrationResult);
            }
            break;

          case 'monthly_contribution':
            console.log('💰 Processing monthly contribution...');
            const { data: contributionResult, error: contributionError } = await supabase
              .rpc('make_contribution', {
                p_member_id: memberId,
                p_amount: paymentDetails.Amount,
                p_payment_reference: paymentDetails.MpesaReceiptNumber,
              });

            if (contributionError) {
              console.error('❌ Error processing monthly contribution:', contributionError);
            } else {
              console.log('✅ Monthly contribution processed successfully:', contributionResult);
            }
            break;

          default:
            console.log('🔧 Processing default payment (general contribution)...');
            const { data: defaultResult, error: defaultError } = await supabase
              .rpc('make_contribution', {
                p_member_id: memberId,
                p_amount: paymentDetails.Amount,
                p_payment_reference: paymentDetails.MpesaReceiptNumber
              });
            if (defaultError) {
              console.error('❌ Error processing default contribution:', defaultError);
            } else {
              console.log('✅ Default contribution processed successfully:', defaultResult);
            }
            break;
        }

        // Update payment_initiations status
        await supabase
          .from('payment_initiations')
          .update({
            status: 'completed',
            mpesa_receipt: paymentDetails.MpesaReceiptNumber,
            processed_at: new Date().toISOString()
          })
          .eq('order_id', Order_ID);

      } catch (processingError) {
        console.error('❌ Error processing payment by type:', processingError);
        
        // Update payment_initiations with error status
        await supabase
          .from('payment_initiations')
          .update({
            status: 'processing_failed',
            error_message: processingError.message,
            processed_at: new Date().toISOString()
          })
          .eq('order_id', Order_ID);
      }
    } else if (ResultCode !== 0) {
      // Update payment_initiations status for failed payments
      await supabase
        .from('payment_initiations')
        .update({
          status: 'failed',
          error_message: ResultDesc,
          processed_at: new Date().toISOString()
        })
        .eq('order_id', Order_ID);
    }

    // 🔔 Emit status update to specific room (Order_ID)
    io.to(Order_ID).emit('paymentStatus', {
      event: 'payment_status',
      orderId: Order_ID,
      memberId: memberId, // Include memberId in the response
      paymentTypeId: paymentTypeId, // Include payment type for frontend handling
      status: ResultCode === 0 ? 'success' : 'failed',
      receipt: paymentDetails.MpesaReceiptNumber,
      transactionId: CheckoutRequestID,
      transactionDate: paymentDetails.TransactionDate,
      phoneNumber: paymentDetails.PhoneNumber,
      amount: paymentDetails.Amount,
      message: ResultDesc,
    });

    res.json({ success: true, received: true });

  } catch (e) {
    console.error("❌ Error processing callback:", e.message);

    // Update payment_initiations with error status
    try {
      await supabase
        .from('payment_initiations')
        .update({
          status: 'callback_error',
          error_message: e.message,
          processed_at: new Date().toISOString()
        })
        .eq('order_id', req.params.Order_ID);
    } catch (updateError) {
      console.error('❌ Error updating payment initiation status:', updateError);
    }

    io.to(req.params.Order_ID).emit('paymentStatus', {
      event: 'payment_status',
      orderId: req.params.Order_ID,
      status: 'failed',
      message: e.message,
    });

    res.status(400).json({
      success: false,
      error: e.message,
      receivedBody: req.body
    });
  }
};


//
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

export const warmupMpesa = async (req, res) => {
  try {
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    res.status(200).send({
      message: "Service warmed up successfully",
      timestamp: new Date().toISOString()
    });
    
  } catch (e) {
    console.error('Warmup failed:', e);
    res.status(503).send({
      message: "Warmup unsuccessful",
      error: e.message 
    });
  }
}

