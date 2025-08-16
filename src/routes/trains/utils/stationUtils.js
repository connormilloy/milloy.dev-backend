const Fuse = require('fuse.js');
const data = require('../data/allUKStations.json');

const fuse = new Fuse(data, {
  keys: ['name'],
  threshold: 0.3,
});

const findStationByQuery = (query) => {
  return fuse
    .search(query)
    .slice(0, 10)
    .map((result) => result.item);
};

module.exports = { findStationByQuery };
