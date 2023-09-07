'use strict';
const AWS = require('aws-sdk');
const StepFunction = new AWS.StepFunctions();
const DynamboDB = require('aws-sdk/clients/dynamodb');
const DocumentClient = new DynamboDB.DocumentClient({region: 'us-east-1'});

const isBookAvailable = (book, quantity) => {
  return (book.quantity - quantity) > 0;
}


module.exports.checkInventory = async ({bookId, quantity}) => {
  try {
    let params = {
      TableName : 'books-dev',
      KeyConditionExpression: 'booksId = :booksId',
      ExpressionAttributesValues: {
        ':booksId': bookId
      }
    }

    let result = await DocumentClient.query(params).promise();
    let book = result.Items[0];

    if(isBookAvailable(book, quantity)){
      return book;
    }else{
      let bookOutOfStockError = new Error(`Sorry! We don't have enough ${book.title}`);
      bookOutOfStockError.name = "BookOutOfStock";
    }

  } catch (error) {
     if(error.name === 'BookOutOfStock'){
      throw error;
     }else{
      let bookNotFoundError = new Error(error);
      bookNotFoundError.name = 'BookNotFound';
      throw bookNotFoundError;
     }
  }
};



module.exports.calculateTotal = async ({book, quantity}) => {
  let total = book.price * quantity;
  return {total};
};

const deductPoints = async (userId) => {
  let params = {
    TableName: '',
    Key: {
      'userId': userId
    },
    UpdateExpression: 'SET points = :zero',
    ExpressionAttributesValues: {
      ':zero': 0
    }
  }
  await DocumentClient.update(params).promise()
}


module.exports.redeemPoints = async ({userId, total}) => {
  let orderTotal = total.total;
  try {
    let params = {
      TableName: 'users-dev',
      Key: {
        'userId': userId
      }
    }
    let result = await DocumentClient.get(params).promise();
    let user = result.Item;
    const points = user.points;
    if(orderTotal > points){
      await deductPoints(userId);
      orderTotal = orderTotal - points;
      return { total: orderTotal, points}
    }else{
      throw new Error('Order total is less than reddem points');
    }
  } catch (error) {
    throw new Error(error);
  }
};


module.exports.billCustomer = async (params) => {
  //* Bill the customer e.g using stripe token from the parameter
  return "Successfully billed";
};

module.exports.prepareOrder = async ({book, quantity}) => {
  return "Order Prepared"
};

module.exports.restoreRedeemPoints = async ({userId , total}) => {
 try {
   if(total.points){
    let params = {
      TableName: 'users-dev',
      Key: {
        'userId': userId
      },
      UpdateExpression: 'SET points = :points',
      ExpressionAttributesValues: {
        ':points': total.points
      }
    };
    await DocumentClient.update(params).promise()
   }
 } catch (error) {
   throw new Error(error)
 }
};

module.exports.restoreQuantity = async ({bookId, quantity}) => {
  try {
     let params = {
       TableName: 'books-dev',
       Key: {
         'bookId': bookId
       },
       UpdateExpression: 'SET quantity = quantity + :orderQuantity',
       ExpressionAttributesValues: {
         ':orderQuantity': quantity
       }
     };
     await DocumentClient.update(params).promise()
     return "Quantity restored"
  } catch (error) {
    throw new Error(error)
  }
 };


const updateBookQuantity = async (bookId, orderQuantity) => {
  console.log('bookId', bookId);
  console.log('orderQuantity', orderQuantity);
  let params = {
    TableName: 'bookTable',
    Key: {'bookId': bookId},
    UpdateExpression: 'SET quantity = quantity - :orderQuantity',
    ExpressionAttributesValues: {
      ':orderQuantity': orderQuantity
    }
  };
  await DocumentClient.update(params).promise();
}



module.exports.sqsWorker = async (event) => {
  try {
    console.log(JSON.stringify(event));
    let record = event.Records([0]);
    var body = JSON.parse(record.body);
    /** Find a courier and attach courier information to the order */
    let courier = "abhishekpanditoff@gmail.com";

    //update book quantity
    await updateBookQuantity(body.Input.bookId, body.Input.quantity);


    //throw "Something wrong with the courier API";

    //Attach Courier information to the order

    await StepFunction.sendTaskSuccess({
      output: JSON.stringify({courier}),
      taskToken: body.token
    }).promise() ;
  } catch (error) {
    console.log("=========== YOU GOT AN ERROR ==========");
    console.log(e);
    await StepFunction.sendTaskFailure({
      error: "NoCourierAvailable",
      cause: "No couriers are available",
      taskToken: body.Token
    }).promise()
  }
}