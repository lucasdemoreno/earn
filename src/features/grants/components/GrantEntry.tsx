import { Box, Button, Flex, Image, Link, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import { grantAmount } from '../utils';

export const GrantEntry = ({
  title,
  minReward,
  maxReward,
  token,
  slug,
  logo,
}: {
  title: string;
  rewardAmount?: number;
  token?: string;
  slug: string;
  logo?: string;
  minReward?: number;
  maxReward?: number;
}) => {
  return (
    <Box w={{ base: '100%', sm: 80 }}>
      <Image
        w={{ base: '100%', sm: '320px' }}
        h={{ base: '240px', sm: '180px' }}
        mb={3}
        borderRadius={5}
        objectFit={'cover'}
        alt=""
        src={logo}
      />
      <Text mb={'4px'} fontSize={'md'} fontWeight={'600'}>
        {title}
      </Text>
      <Flex align={'center'} justify={'space-between'}>
        <Text color={'brand.slate.500'} fontSize={'13px'} fontWeight={'600'}>
          {token
            ? `${grantAmount({ minReward: minReward!, maxReward: maxReward! })} ${token}`
            : ''}
        </Text>
        <Link as={NextLink} href={`/grants/${slug}`}>
          <Button
            color="brand.slate.400"
            fontSize={{ base: 'sm', md: 'md' }}
            fontWeight={500}
            borderColor={'brand.slate.400'}
            size={{ base: 'sm', md: 'md' }}
            variant="outline"
          >
            Apply
          </Button>
        </Link>
      </Flex>
    </Box>
  );
};
