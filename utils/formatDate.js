const moment = require('moment');

exports.formatDate = (date) => {
  return moment(date).format('DD MMM YYYY');
};