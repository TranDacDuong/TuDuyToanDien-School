'use strict';

async function readParentRelationship(api, uid, knownFriends) {
  uid = String(uid);
  if (knownFriends?.has(uid)) return { is_friend: 1 };
  if (!knownFriends) {
    const response = await api.getAllFriends();
    const friends = Array.isArray(response) ? response : response?.data;
    if (!Array.isArray(friends)) throw new Error('Không đọc được danh sách bạn bè Zalo');
    if (friends.some(friend => String(friend.userId || friend.uid) === uid)) return { is_friend: 1 };
  }
  const relationship = await api.getFriendRequestStatus(uid);
  if (!relationship) throw new Error('Không đọc được trạng thái kết bạn');
  if (Number(relationship.is_friend) === 1) return { is_friend: 1 };
  // Verify direction against the actual lists before accepting any invitation.
  const sent = await api.getSentFriendRequest().catch(error => {
    if (Number(error.code) === 112) return {};
    throw error;
  });
  if (Object.values(sent || {}).some(friend => String(friend.userId) === uid) || sent?.[uid]) {
    return { is_requesting: 1 };
  }
  const received = await api.getFriendRecommendations();
  if (!Array.isArray(received?.recommItems)) throw new Error('Không đọc được lời mời kết bạn Zalo');
  const incoming = received.recommItems.some(item => Number(item.dataInfo?.recommType) === 2 && String(item.dataInfo.userId) === uid);
  return incoming ? { is_requested: 1 } : { is_friend: 0, is_requesting: 0, is_requested: 0 };
}

module.exports = { readParentRelationship };
