exports.postValidationModel = {
    'client': {
        notEmpty: true,
        isGuid: true
    },
    'sensor_type': {
        notEmpty: true,
        isLength: {
            options: [2, 15]
        }
    },
    'sensor_id': {
        notEmpty: true,
        isInt: true
    },
    'state': {
        notEmpty: true,
        isInt: true
    }
};