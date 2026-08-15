import { latLngToCell, gridPathCells, gridDisk } from 'h3-js';
import User from '../models/userModel.js';

const H3_RESOLUTION = 9;

export const getHexesForRide = (startLocation, endLocation) => {
  const startLat = Number(startLocation.latitude);
  const startLng = Number(startLocation.longitude);
  const endLat = Number(endLocation.latitude);
  const endLng = Number(endLocation.longitude);

  if (!Number.isFinite(startLat) || !Number.isFinite(startLng) || !Number.isFinite(endLat) || !Number.isFinite(endLng)) {
    return [];
  }

  const startCell = latLngToCell(startLat, startLng, H3_RESOLUTION);
  const endCell = latLngToCell(endLat, endLng, H3_RESOLUTION);

  const pathCells = gridPathCells(startCell, endCell);

  const newlyUnfogged = new Set();
  for (const cell of pathCells) {
    newlyUnfogged.add(cell);
    const neighbors = gridDisk(cell, 1);
    for (const neighbor of neighbors) {
      newlyUnfogged.add(neighbor);
    }
  }

  return Array.from(newlyUnfogged);
};

export const updateUserExploration = async (userId, hexes, session) => {
  if (!hexes || hexes.length === 0) return;
  await User.findByIdAndUpdate(
    userId,
    { $addToSet: { unfoggedHexes: { $each: hexes } } },
    { session }
  );
};

export const processRideCompletion = async (ride, session) => {
  const hexes = getHexesForRide(ride.startLocation, ride.endLocation);
  if (hexes.length === 0) return;

  const participantIds = [ride.driver];
  for (const passenger of ride.passengers) {
    if (passenger.userId) {
      participantIds.push(passenger.userId);
    }
  }

  const uniqueIds = [...new Set(participantIds.map(id => id.toString()))];
  for (const id of uniqueIds) {
    await updateUserExploration(id, hexes, session);
  }
};
