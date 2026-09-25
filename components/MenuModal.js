import React from 'react';
import { Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';

export default function MenuModal({ visible, onClose, onLogout, t }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.menuOverlay} />
      </TouchableWithoutFeedback>
      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem} onPress={onLogout}>
          <Text style={styles.menuItemText}>{t.logout}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = {
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menuContainer: {
    position: 'absolute',
    top: 60,
    right: 24,
    backgroundColor: '#181818',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  menuItemText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '500',
  },
}; 