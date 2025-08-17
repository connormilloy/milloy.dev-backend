require('dotenv').config();
const { RAIL_API_BASE_ENDPOINT } = require('./constants');

const fetchSpecificDepartureInformationForStation = async (
  origin,
  destination
) => {
  try {
    const response = await fetch(
      `${RAIL_API_BASE_ENDPOINT}/json/search/${origin}/to/${destination}`,
      {
        headers: {
          Authorization: `Basic ${process.env.RAIL_API_AUTH_STRING}`,
        },
      }
    );

    return await response.json();
  } catch (error) {
    console.error(
      `Failed to get next departure from ${origin} to ${destination}:`,
      error
    );
    throw new Error(
      `Failed to fetch next departure from ${origin} to ${destination}: ${error.message}`
    );
  }
};

const findUpcomingDepartures = async (
  origin,
  destination,
  numDepartures = 1
) => {
  const now = new Date().toLocaleTimeString('en-GB');

  if (numDepartures && isNaN(numDepartures)) {
    throw new Error('numDepartures must be a valid number.');
  }

  try {
    const { services: departures } =
      await fetchSpecificDepartureInformationForStation(origin, destination);

    if (!departures || departures.length === 0) {
      return null;
    }

    return departures
      .map((departure) => {
        const { runDate } = departure;
        const timeStr =
          departure.locationDetail.realTimeDeparture ||
          departure.locationDetail.gbttBookedDeparture;

        const dt = new Date(
          `${runDate}T${timeStr.slice(0, 2)}:${timeStr.slice(2)}:00`
        ).toLocaleTimeString('en-GB');

        return {
          ...departure,
          departureDateTime: dt,
        };
      })
      .filter((departure) => !('cancelReasonCode' in departure.locationDetail))
      .filter((departure) => departure.departureDateTime > now)
      .sort((a, b) => a.departureDateTime - b.departureDateTime)
      .slice(0, numDepartures);
  } catch (error) {
    console.error(`Failed to find upcoming departures`, error);
    throw new Error(`Failed to find upcoming departures: ${error.message}`);
  }
};

module.exports = {
  findUpcomingDepartures,
};
